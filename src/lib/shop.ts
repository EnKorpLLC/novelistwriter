import "server-only";
import { randomBytes } from "crypto";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, appUrl } from "@/lib/stripe";
import { renderEmail, sendEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notifications";
import { recordRevenue } from "@/lib/money";
import { signedDownloadUrl } from "@/lib/r2";
import { PREORDER_HOLD, adjustBookPurchaseForCharge, sellerStatus } from "@/lib/direct-sales";
import { REFUND_WINDOW_DAYS, dollars, longDay, platformFeeCents, type SellerTier } from "@/lib/direct-sale-rules";
import {
  ADDRESS_HIDE_DAYS,
  CARRIERS,
  LATE_GRACE_DAYS,
  TRACKING_REQUIRED_OVER_CENTS,
  addBusinessDays,
  type ItemKind,
  type ShopItem,
  type ShopSettings,
} from "@/lib/shop-rules";

/**
 * The author's shop (physical sales PH3): signed books, bookmarks, and prints the author ships themselves. We're the
 * seller as with everything else; the author gets the price plus the shipping they charged, less our fee and Stripe's,
 * paid 14 days after they mark the order shipped. Late orders are refunded and pause the shop.
 */

export const SHOP_HINT = "The shop needs a database update. Run supabase/migration_shop.sql in the Supabase SQL editor.";
const DAY_MS = 86_400_000;

type ItemRow = {
  id: string;
  author_user_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  description: string;
  price_cents: number;
  stock: number;
  personalize: boolean;
  photo_key: string | null;
  active: boolean;
};

export async function itemFromRow(r: ItemRow): Promise<ShopItem> {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind as ItemKind,
    title: r.title,
    description: r.description,
    priceCents: r.price_cents,
    stock: r.stock,
    personalize: r.personalize,
    active: r.active,
    photoUrl: r.photo_key ? await signedDownloadUrl(r.photo_key, 6 * 3600).catch(() => null) : null,
  };
}

export async function shopSettings(admin: SupabaseClient, authorId: string): Promise<ShopSettings | null> {
  const { data, error } = await admin.from("shop_settings").select("*").eq("author_user_id", authorId).maybeSingle();
  if (error) return null;
  return {
    shipFirstCents: data?.ship_first_cents ?? 500,
    shipEachCents: data?.ship_each_cents ?? 100,
    handlingDays: data?.handling_days ?? 5,
    pausedReason: data?.paused_at ? (data.paused_reason as string) || "Paused" : null,
  };
}

/** Items to show on a book's launch page: that book's, then the author's general ones. */
export async function itemsForBook(admin: SupabaseClient, authorId: string, projectId: string) {
  const [settings, status] = await Promise.all([shopSettings(admin, authorId), sellerStatus(admin, authorId)]);
  const selling = !("migrationNeeded" in status) && status.tier && status.termsAccepted && status.payoutsEnabled;
  if (!settings || settings.pausedReason || !selling) return { items: [] as ShopItem[], settings };
  const { data } = await admin.from("shop_items").select("*").eq("author_user_id", authorId).eq("active", true).or(`project_id.eq.${projectId},project_id.is.null`).order("sort").limit(8);
  const items = await Promise.all(((data || []) as ItemRow[]).map(itemFromRow));
  return { items: items.sort((a, b) => Number(Boolean(b.projectId)) - Number(Boolean(a.projectId))), settings };
}

/** Can this many of this item be bought now? */
export async function itemReadiness(admin: SupabaseClient, itemId: string, quantity: number) {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false as const, reason: "Item not found." };
  const { data: row } = await admin.from("shop_items").select("*").eq("id", itemId).maybeSingle();
  if (!row?.active) return { ok: false as const, reason: "This isn't for sale right now." };
  const item = row as ItemRow;
  if (item.stock < quantity) return { ok: false as const, reason: item.stock ? `Only ${item.stock} left.` : "Sold out." };
  const [status, settings] = await Promise.all([sellerStatus(admin, item.author_user_id), shopSettings(admin, item.author_user_id)]);
  if ("migrationNeeded" in status || !status.tier || !status.termsAccepted || !status.payoutsEnabled || !settings || settings.pausedReason) {
    return { ok: false as const, reason: "The author's shop isn't open right now." };
  }
  return { ok: true as const, item, settings, tier: status.tier };
}

const token = () => randomBytes(24).toString("base64url");
type SessionShipping = { name?: string | null; address?: Stripe.Address | null };
const shippingOf = (s: Stripe.Checkout.Session): SessionShipping | null => {
  const x = s as unknown as { shipping_details?: SessionShipping | null; collected_information?: { shipping_details?: SessionShipping | null } | null };
  return x.collected_information?.shipping_details || x.shipping_details || null;
};

async function refundOrder(admin: SupabaseClient, p: Record<string, unknown>, why: string) {
  const stripe = getStripe();
  if (!p.stripe_payment_intent) return;
  await stripe.refunds.create({ payment_intent: p.stripe_payment_intent as string, metadata: { reason: why, purchase_id: String(p.id || "") } }, { idempotencyKey: `shop-refund-${p.id || p.stripe_payment_intent}` });
  if (p.stripe_charge_id) await adjustBookPurchaseForCharge(admin, await stripe.charges.retrieve(p.stripe_charge_id as string), "refunded");
}

/** checkout.session.completed for a shop item: take it from stock, record it, and tell the author to ship it. Safe to run twice. */
export async function recordItemPurchase(admin: SupabaseClient, sessionId: string) {
  const { data: existing } = await admin.from("book_purchases").select("id").eq("stripe_session_id", sessionId).limit(1);
  if (existing?.length) return { ok: true, skipped: "already_recorded" };
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge.balance_transaction"] });
  if (session.payment_status !== "paid") return { ok: true, skipped: "not_paid" };
  const meta = session.metadata || {};
  const qty = Math.max(1, Number(meta.quantity) || 1);
  const { data: item } = await admin.from("shop_items").select("*").eq("id", meta.item_id || "").maybeSingle();
  if (!item) return { ok: false, skipped: "missing_item" };
  const pi = session.payment_intent as Stripe.PaymentIntent | null;
  const charge = (pi?.latest_charge as Stripe.Charge | null) || null;
  const bt = (charge?.balance_transaction as Stripe.BalanceTransaction | null) || null;
  const email = (session.customer_details?.email || "").toLowerCase();

  // Take it from stock; two buyers racing for the last one means the second is refunded straight away
  let taken = false;
  for (let attempt = 0; attempt < 3 && !taken; attempt++) {
    const { data: now } = await admin.from("shop_items").select("stock").eq("id", item.id).maybeSingle();
    const stock = Number(now?.stock) || 0;
    if (stock < qty) break;
    const { data: upd } = await admin.from("shop_items").update({ stock: stock - qty }).eq("id", item.id).eq("stock", stock).select("id");
    taken = Boolean(upd?.length);
  }
  if (!taken) {
    await refundOrder(admin, { stripe_payment_intent: pi?.id, id: session.id }, "sold_out");
    if (email) {
      const mail = renderEmail({ heading: `Sorry: ${item.title} sold out`, paragraphs: ["Someone bought the last one a moment before you did, so we've refunded you in full. It can take a few days to show on your statement."] });
      await sendEmail({ to: email, subject: `Refunded: ${item.title} sold out`, text: mail.text, html: mail.html }).catch(() => null);
    }
    return { ok: true, applied: "sold_out_refunded" };
  }

  const tax = session.total_details?.amount_tax ?? 0;
  const shipping = session.shipping_cost?.amount_subtotal ?? (Number(meta.ship_cents) || 0);
  const price = Math.max(0, (session.amount_total ?? 0) - tax - shipping);
  const stripeFee = bt?.fee ?? Math.round((session.amount_total ?? 0) * 0.029) + 30;
  const tier = (meta.tier === "studio" ? "studio" : "pro") as SellerTier;
  const fee = platformFeeCents(price, tier);
  let buyerId = meta.buyer_user_id || null;
  if (!buyerId && email) {
    const { data: p } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    buyerId = (p?.id as string | null) || null;
  }
  const ship = shippingOf(session);
  const a = ship?.address;
  const settings = await shopSettings(admin, item.author_user_id);
  const shipBy = addBusinessDays(new Date(), settings?.handlingDays ?? 5);
  const { data: row, error } = await admin
    .from("book_purchases")
    .insert({
      project_id: item.project_id,
      author_user_id: item.author_user_id,
      buyer_user_id: buyerId,
      buyer_email: email,
      buyer_name: (session.customer_details?.name || "").slice(0, 120),
      title: qty > 1 ? `${item.title} × ${qty}` : item.title,
      format: "item",
      item_id: item.id,
      quantity: qty,
      personalization: String(meta.personalization || "").slice(0, 60) || null,
      price_cents: price,
      tax_cents: tax,
      shipping_cents: shipping,
      stripe_fee_cents: stripeFee,
      platform_fee_cents: fee,
      // The author ships it, so the shipping they charged is theirs
      author_cents: price + shipping - stripeFee - fee,
      currency: session.currency || "usd",
      stripe_session_id: session.id,
      order_ref: session.id,
      stripe_payment_intent: pi?.id || null,
      stripe_charge_id: charge?.id || null,
      available_at: PREORDER_HOLD,
      download_token: token(),
      ship_to: a ? { name: ship?.name || "", street1: a.line1 || "", street2: a.line2 || "", city: a.city || "", state: a.state || "", postcode: a.postal_code || "", country: a.country || "US" } : null,
      ship_by: shipBy,
    })
    .select("id, download_token")
    .single();
  if (error || !row) {
    if (error && /duplicate|unique/i.test(error.message)) return { ok: true, skipped: "already_recorded" };
    throw new Error(error?.message || "Shop order not recorded");
  }
  await recordRevenue(admin, { stripeRef: `sale:${session.id}`, kind: "sales_fee", amountCents: fee, occurredAt: new Date().toISOString(), userId: item.author_user_id }).catch(() => null);

  if (email) {
    const mail = renderEmail({
      heading: `Your order: ${item.title}`,
      paragraphs: [
        `Thank you for ordering direct from the author. They ship it themselves, by ${longDay(shipBy)}, and you'll get an email with tracking when it's on its way.`,
        meta.personalization ? `Personalized: “${meta.personalization}”` : "",
        `You paid ${dollars(session.amount_total ?? 0)}${tax ? ` including ${dollars(tax)} tax` : ""} and ${dollars(shipping)} shipping. Questions? Reply to this email.`,
      ].filter(Boolean),
      button: { label: "See your order", url: appUrl(`/purchase/${row.download_token}`) },
    });
    await sendEmail({ to: email, subject: `Your order: ${item.title}`, text: mail.text, html: mail.html }).catch(() => null);
  }
  await notifyUser(admin, item.author_user_id, {
    type: "book_sale",
    title: `New order to ship: ${item.title}${qty > 1 ? ` × ${qty}` : ""}`,
    body: `Ship by ${longDay(shipBy)}${meta.personalization ? `, personalized “${meta.personalization}”` : ""}. ${dollars(price + shipping - stripeFee - fee)} is yours, paid ${REFUND_WINDOW_DAYS} days after you mark it shipped.`,
    href: "/dashboard/orders",
  }).catch(() => null);
  return { ok: true, applied: "shop_item" };
}

const trackingUrl = (carrier: string, n: string) => {
  const t = encodeURIComponent(n);
  return carrier === "USPS"
    ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`
    : carrier === "UPS"
      ? `https://www.ups.com/track?tracknum=${t}`
      : carrier === "FedEx"
        ? `https://www.fedex.com/fedextrack/?trknbr=${t}`
        : carrier === "DHL"
          ? `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`
          : null;
};

/** The author marks an order shipped: the buyer gets tracking, and the author's payout clock starts. */
export async function markShipped(admin: SupabaseClient, authorId: string, purchaseId: string, carrier: string, tracking: string) {
  const { data: p } = await admin.from("book_purchases").select("*").eq("id", purchaseId).eq("author_user_id", authorId).eq("format", "item").maybeSingle();
  if (!p) throw new Error("Order not found.");
  if (p.status !== "paid") throw new Error("This order was refunded, so don't ship it.");
  if (p.shipped_at) throw new Error("It's already marked shipped.");
  const c = CARRIERS.includes(carrier) ? carrier : "Other";
  const n = tracking.trim().replace(/\s+/g, "").slice(0, 60);
  if (!n && p.price_cents + p.shipping_cents > TRACKING_REQUIRED_OVER_CENTS) throw new Error(`Orders over ${dollars(TRACKING_REQUIRED_OVER_CENTS)} need a tracking number.`);
  const now = new Date();
  const url = n ? trackingUrl(c, n) : null;
  await admin
    .from("book_purchases")
    .update({ shipped_at: now.toISOString(), carrier: c, tracking_url: url || (n ? `${c} ${n}` : null), available_at: new Date(now.getTime() + REFUND_WINDOW_DAYS * DAY_MS).toISOString() })
    .eq("id", p.id);
  if (p.buyer_email) {
    const mail = renderEmail({
      heading: `${p.title} is on its way`,
      paragraphs: [n ? `The author shipped it with ${c}. Tracking number: ${n}.` : `The author shipped it${c !== "Other" ? ` with ${c}` : ""}.`],
      button: url ? { label: "Track it", url } : { label: "See your order", url: appUrl(`/purchase/${p.download_token}`) },
    });
    await sendEmail({ to: p.buyer_email, subject: `Shipped: ${p.title}`, text: mail.text, html: mail.html }).catch(() => null);
  }
}

/** The author's orders, to ship first. Addresses disappear 90 days after shipping. */
export async function authorOrders(admin: SupabaseClient, authorId: string) {
  const { data, error } = await admin.from("book_purchases").select("*").eq("author_user_id", authorId).eq("format", "item").order("created_at", { ascending: false }).limit(300);
  if (error) return null;
  const hideBefore = Date.now() - ADDRESS_HIDE_DAYS * DAY_MS;
  return (data || []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    quantity: Number(p.quantity) || 1,
    personalization: (p.personalization as string | null) || null,
    buyerName: (p.buyer_name as string) || "",
    orderedAt: p.created_at as string,
    shipBy: (p.ship_by as string | null) || null,
    shippedAt: (p.shipped_at as string | null) || null,
    tracking: (p.tracking_url as string | null) || null,
    status: p.status as string,
    totalCents: (p.price_cents as number) + (p.shipping_cents as number),
    youGetCents: p.author_cents as number,
    address: p.shipped_at && Date.parse(p.shipped_at as string) < hideBefore ? null : (p.ship_to as Record<string, string> | null),
  }));
}

/** Daily: remind authors two days before an order is due, and refund (and pause the shop) when one is badly late. */
export async function sweepShopOrders(admin: SupabaseClient, opts: { timeBudgetMs: number }) {
  const stopAt = Date.now() + opts.timeBudgetMs;
  const { data, error } = await admin.from("book_purchases").select("*").eq("format", "item").eq("status", "paid").is("shipped_at", null).limit(500);
  if (error || !data?.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 2 * DAY_MS).toISOString().slice(0, 10);
  const late = new Date(Date.now() - LATE_GRACE_DAYS * DAY_MS).toISOString().slice(0, 10);
  let n = 0;
  for (const p of data) {
    if (Date.now() > stopAt) break;
    if (!p.ship_by) continue;
    if (p.ship_by === soon) {
      await notifyUser(admin, p.author_user_id, { type: "book_sale", title: `Ship by ${longDay(p.ship_by)}: ${p.title}`, body: "Mark it shipped (with tracking) on your orders page once it's in the mail.", href: "/dashboard/orders" }).catch(() => null);
    } else if (p.ship_by < late) {
      await refundOrder(admin, p, "not_shipped").catch(() => null);
      // Put it back in stock, and pause the shop until the author comes back to it
      if (p.item_id) {
        const { data: it } = await admin.from("shop_items").select("stock").eq("id", p.item_id).maybeSingle();
        if (it) await admin.from("shop_items").update({ stock: (Number(it.stock) || 0) + (Number(p.quantity) || 1) }).eq("id", p.item_id);
      }
      await admin.from("shop_settings").upsert({ author_user_id: p.author_user_id, paused_at: new Date().toISOString(), paused_reason: `An order (${p.title}) wasn't shipped within ${LATE_GRACE_DAYS} days of its ship-by date, so it was refunded.`, updated_at: new Date().toISOString() }, { onConflict: "author_user_id" });
      await notifyUser(admin, p.author_user_id, { type: "book_sale", title: `Refunded and paused: ${p.title}`, body: `It wasn't marked shipped by ${longDay(p.ship_by)}, so the reader was refunded and your shop is paused. Reopen it from your shop page.`, href: "/dashboard/shop" }).catch(() => null);
      if (p.buyer_email) {
        const mail = renderEmail({ heading: `We refunded your order of ${p.title}`, paragraphs: ["It wasn't shipped in time, so we've refunded you in full. It can take a few days to show on your statement."] });
        await sendEmail({ to: p.buyer_email, subject: `Refunded: ${p.title}`, text: mail.text, html: mail.html }).catch(() => null);
      }
      n++;
    } else if (p.ship_by < today) {
      await notifyUser(admin, p.author_user_id, { type: "book_sale", title: `Late: ${p.title}`, body: `It was due to ship by ${longDay(p.ship_by)}. If it isn't marked shipped within ${LATE_GRACE_DAYS} days of that, it's refunded and your shop pauses.`, href: "/dashboard/orders" }).catch(() => null);
    }
  }
  return n;
}

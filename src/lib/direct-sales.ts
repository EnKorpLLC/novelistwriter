import "server-only";
import { createHash, randomBytes } from "crypto";
import type Stripe from "stripe";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, appUrl } from "@/lib/stripe";
import { rowHasPro, rowHasStudio } from "@/lib/credits";
import { notifyUser } from "@/lib/notifications";
import { renderEmail, sendEmail } from "@/lib/email";
import { recordRevenue } from "@/lib/money";
import { escapeXml, buildBook } from "@/lib/book/model";
import { normalizeDetails, normalizeFormat } from "@/lib/book/format";
import { getStyle } from "@/lib/book/styles";
import { buildStyledEpub } from "@/lib/book/epub";
import { loadBookExtras, loadCover } from "@/lib/book/load";
import {
  PAYOUT_MIN_CENTS,
  REFUND_WINDOW_DAYS,
  currentPrice,
  dollars,
  normalizeCode,
  normalizeDirectSale,
  platformFeeCents,
  type DiscountCode,
  type SellerTier,
} from "@/lib/direct-sale-rules";

export const SALES_MIGRATION_HINT = "Database needs an update. Run supabase/migration_direct_sales.sql in the Supabase SQL editor.";
const DAY_MS = 86_400_000;

/** Buying direct is US-only for now; Vercel tells us the visitor's country. Unknown (local dev) is allowed. */
export async function buyerCountryAllowed() {
  const country = (await headers()).get("x-vercel-ip-country");
  return !country || country === "US";
}

/** Pro or Studio decides the fee; Free can't sell. */
export async function sellerTier(admin: SupabaseClient, userId: string): Promise<SellerTier | null> {
  const { data } = await admin.from("credit_balances").select("*").eq("user_id", userId).maybeSingle();
  return rowHasStudio(data) ? "studio" : rowHasPro(data) ? "pro" : null;
}

export type SellerStatus = { tier: SellerTier | null; termsAccepted: boolean; hasAccount: boolean; payoutsEnabled: boolean };

export async function sellerStatus(admin: SupabaseClient, userId: string): Promise<SellerStatus | { migrationNeeded: true }> {
  const [tier, { data, error }] = await Promise.all([sellerTier(admin, userId), admin.from("seller_accounts").select("*").eq("user_id", userId).maybeSingle()]);
  if (error) return { migrationNeeded: true };
  return { tier, termsAccepted: Boolean(data?.terms_accepted_at), hasAccount: Boolean(data?.stripe_account_id), payoutsEnabled: Boolean(data?.payouts_enabled) };
}

/** Start or resume Stripe's onboarding. An author who's also an affiliate keeps one payout account for both. */
export async function sellerOnboardingUrl(admin: SupabaseClient, userId: string, email: string | null, returnPath: string) {
  const stripe = getStripe();
  const { data: seller } = await admin.from("seller_accounts").select("stripe_account_id, terms_accepted_at").eq("user_id", userId).maybeSingle();
  if (!seller?.terms_accepted_at) throw new Error("Accept the seller terms first.");
  let accountId = seller.stripe_account_id as string | null;
  if (!accountId) {
    const { data: aff } = await admin.from("affiliates").select("stripe_account_id").eq("user_id", userId).maybeSingle();
    accountId = (aff?.stripe_account_id as string | null) || null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: email || undefined,
        capabilities: { transfers: { requested: true } },
        business_profile: { product_description: "Ebook sales through Novelist Writer", url: appUrl("/") },
        metadata: { supabase_user_id: userId },
      });
      accountId = account.id;
    }
    await admin.from("seller_accounts").update({ stripe_account_id: accountId }).eq("user_id", userId);
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: appUrl(`${returnPath}${returnPath.includes("?") ? "&" : "?"}payouts=refresh`),
    return_url: appUrl(`${returnPath}${returnPath.includes("?") ? "&" : "?"}payouts=done`),
    type: "account_onboarding",
  });
  return link.url;
}

export async function refreshSellerPayouts(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from("seller_accounts").select("stripe_account_id").eq("user_id", userId).maybeSingle();
  if (!data?.stripe_account_id) return false;
  const account = await getStripe().accounts.retrieve(data.stripe_account_id);
  const enabled = Boolean(account.payouts_enabled && account.capabilities?.transfers === "active");
  await admin.from("seller_accounts").update({ payouts_enabled: enabled }).eq("user_id", userId);
  return enabled;
}

/** Can this book be bought right now? Reasons are written for the author's Launch tab. */
export async function saleReadiness(admin: SupabaseClient, project: { user_id: string; published?: boolean | null; direct_sale?: unknown }) {
  const s = normalizeDirectSale(project.direct_sale);
  const status = await sellerStatus(admin, project.user_id);
  if ("migrationNeeded" in status) return { ok: false as const, reason: SALES_MIGRATION_HINT };
  if (!status.tier) return { ok: false as const, reason: "Selling direct is part of Pro and Studio." };
  if (!s.on) return { ok: false as const, reason: "Selling is turned off for this book." };
  if (!project.published) return { ok: false as const, reason: "Mark the book out now to start selling." };
  if (!status.termsAccepted) return { ok: false as const, reason: "Accept the seller terms." };
  if (!status.payoutsEnabled) return { ok: false as const, reason: "Finish setting up payouts with Stripe." };
  return { ok: true as const, tier: status.tier, sale: s };
}

/* ---------- Bundles ---------- */

export type Bundle = { id: string; title: string; projectIds: string[]; priceCents: number; active: boolean };

const bundleFromRow = (r: { id: string; title: string; project_ids: string[]; price_cents: number; active: boolean }): Bundle => ({
  id: r.id,
  title: r.title,
  projectIds: r.project_ids || [],
  priceCents: r.price_cents,
  active: r.active,
});

/**
 * Can this bundle be bought now? The author must be set up to sell, and every book in it must be out
 * (each book doesn't need its own single-copy sale turned on).
 */
export async function bundleReadiness(admin: SupabaseClient, bundleId: string) {
  const { data: row } = await admin.from("book_bundles").select("*").eq("id", bundleId).maybeSingle();
  if (!row?.active) return { ok: false as const, reason: "This bundle isn't for sale." };
  const bundle = bundleFromRow(row);
  const status = await sellerStatus(admin, row.author_user_id);
  if ("migrationNeeded" in status || !status.tier || !status.termsAccepted || !status.payoutsEnabled) return { ok: false as const, reason: "This bundle isn't for sale right now." };
  const { data: books } = await admin.from("projects").select("id, title, published, direct_sale").in("id", bundle.projectIds).eq("user_id", row.author_user_id);
  if ((books || []).length !== bundle.projectIds.length || (books || []).some((b) => !b.published)) return { ok: false as const, reason: "Every book in a bundle has to be out." };
  const regularCents = (books || []).reduce((n, b) => n + currentPrice(normalizeDirectSale(b.direct_sale)).cents, 0);
  return { ok: true as const, bundle, authorId: row.author_user_id as string, tier: status.tier, books: books || [], regularCents };
}

/** Bundles a launch page should offer for this book, with what they save against buying each book. */
export async function bundlesForBook(admin: SupabaseClient, projectId: string) {
  const { data, error } = await admin.from("book_bundles").select("id").contains("project_ids", [projectId]).eq("active", true).limit(5);
  if (error || !data?.length) return [];
  const out: { id: string; title: string; count: number; priceCents: number; savingsCents: number }[] = [];
  for (const r of data) {
    const ready = await bundleReadiness(admin, r.id).catch(() => null);
    if (ready?.ok) out.push({ id: ready.bundle.id, title: ready.bundle.title, count: ready.bundle.projectIds.length, priceCents: ready.bundle.priceCents, savingsCents: Math.max(0, ready.regularCents - ready.bundle.priceCents) });
  }
  return out;
}

export async function listBundles(admin: SupabaseClient, authorId: string): Promise<Bundle[] | null> {
  const { data, error } = await admin.from("book_bundles").select("*").eq("author_user_id", authorId).order("created_at", { ascending: false });
  return error ? null : (data || []).map(bundleFromRow);
}

/* ---------- Discount codes ---------- */

type CodeRow = {
  id: string;
  code: string;
  percent_off: number | null;
  amount_off_cents: number | null;
  project_ids: string[] | null;
  max_uses: number | null;
  uses: number;
  ends_on: string | null;
  active: boolean;
};

export function codeFromRow(r: CodeRow): DiscountCode {
  return {
    id: r.id,
    code: r.code,
    percentOff: r.percent_off,
    amountOffCents: r.amount_off_cents,
    projectIds: r.project_ids || [],
    maxUses: r.max_uses,
    uses: r.uses,
    endsOn: r.ends_on,
    active: r.active,
  };
}

/** One of this author's codes, by what the reader typed. */
export async function findCode(admin: SupabaseClient, authorId: string, raw: unknown): Promise<DiscountCode | null> {
  const code = normalizeCode(raw);
  if (!code) return null;
  const { data } = await admin.from("discount_codes").select("*").eq("author_user_id", authorId).ilike("code", code).maybeSingle();
  return data ? codeFromRow(data as CodeRow) : null;
}

/* ---------- After payment ---------- */

const token = () => randomBytes(24).toString("base64url");

async function addToLibrary(admin: SupabaseClient, userId: string, projectId: string, title: string, shelf: string) {
  const { data: entry } = await admin.from("library_entries").select("id, custom_shelves").eq("user_id", userId).eq("project_id", projectId).maybeSingle();
  const shelves = [...new Set([...(entry?.custom_shelves || []), shelf])];
  if (entry) await admin.from("library_entries").update({ custom_shelves: shelves, updated_at: new Date().toISOString() }).eq("id", entry.id);
  else await admin.from("library_entries").insert({ user_id: userId, project_id: projectId, title, source: "here", shelf: "want", custom_shelves: shelves });
}

/**
 * Reader magnet: the book as a free "purchase", so it gets the same download link, library entry, and receipt.
 * One copy per email per book; asking again just resends the link.
 */
export async function deliverMagnet(admin: SupabaseClient, opts: { projectId: string; authorId: string; email: string; name?: string }) {
  const email = opts.email.trim().toLowerCase();
  const ref = `magnet:${opts.projectId}:${email}`;
  const { data: project } = await admin.from("projects").select("id, title").eq("id", opts.projectId).maybeSingle();
  const title = (project?.title as string) || "Your free ebook";
  const { data: prior } = await admin.from("book_purchases").select("id, download_token, buyer_user_id").eq("stripe_session_id", ref).maybeSingle();
  let purchase = prior;
  if (!purchase) {
    const { data: p } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    const { data: inserted, error } = await admin
      .from("book_purchases")
      .insert({
        project_id: opts.projectId,
        author_user_id: opts.authorId,
        buyer_user_id: (p?.id as string | null) || null,
        buyer_email: email,
        buyer_name: String(opts.name || "").slice(0, 120),
        title,
        price_cents: 0,
        currency: "usd",
        stripe_session_id: ref,
        available_at: new Date().toISOString(),
        download_token: token(),
      })
      .select("id, download_token, buyer_user_id")
      .single();
    if (error) throw new Error(error.message.includes("book_purchases") ? SALES_MIGRATION_HINT : error.message);
    purchase = inserted;
    if (purchase.buyer_user_id) await addToLibrary(admin, purchase.buyer_user_id, opts.projectId, title, "free").catch(() => null);
  }
  await admin.from("magnet_claims").update({ status: "delivered", purchase_id: purchase.id }).eq("project_id", opts.projectId).eq("email", email);
  const mail = renderEmail({
    heading: `Your free copy of ${title}`,
    paragraphs: [
      `Thanks for joining the list. Here's ${title}, free. The link keeps working whenever you need the file again.`,
      purchase.buyer_user_id ? "It's also in your Novelist Writer library." : "Create a free reader account with this email to keep it in your library.",
    ],
    button: { label: "Download your ebook", url: appUrl(`/purchase/${purchase.download_token}`) },
  });
  await sendEmail({ to: email, subject: `Your free copy of ${title}`, text: mail.text, html: mail.html }).catch(() => null);
  return { downloadUrl: `/purchase/${purchase.download_token}` };
}

/** After a reader confirms their email: send every free book they asked this author for. */
export async function deliverPendingMagnets(admin: SupabaseClient, authorId: string, email: string) {
  const { data: claims } = await admin.from("magnet_claims").select("project_id, name").eq("author_user_id", authorId).eq("email", email.toLowerCase()).eq("status", "pending");
  const out: string[] = [];
  for (const c of claims || []) {
    const d = await deliverMagnet(admin, { projectId: c.project_id, authorId, email, name: c.name }).catch(() => null);
    if (d) out.push(d.downloadUrl);
  }
  return out;
}

/** Split a total across items by weight, so the parts always add back up to the total. */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((n, w) => n + w, 0) || weights.length;
  const parts = weights.map((w) => Math.floor((total * (sum ? w : 1)) / sum));
  let left = total - parts.reduce((n, p) => n + p, 0);
  for (let i = 0; left > 0; i = (i + 1) % parts.length, left--) parts[i] += 1;
  return parts;
}

/**
 * checkout.session.completed for a book or a bundle: one row per book with Stripe's real fee, the books in the
 * buyer's library, one receipt, and a notice to the author. Safe to run twice for the same session.
 */
export async function recordBookPurchase(admin: SupabaseClient, sessionId: string) {
  const { data: existing } = await admin.from("book_purchases").select("id").eq("stripe_session_id", sessionId).limit(1);
  if (existing?.length) return { ok: true, skipped: "already_recorded" };
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge.balance_transaction"] });
  if (session.payment_status !== "paid") return { ok: true, skipped: "not_paid" };
  const meta = session.metadata || {};
  const authorId = meta.author_user_id;
  const projectIds = (meta.bundle_id ? String(meta.project_ids || "") : String(meta.project_id || "")).split(",").filter(Boolean);
  if (!projectIds.length || !authorId) return { ok: false, skipped: "missing_book" };

  const pi = session.payment_intent as Stripe.PaymentIntent | null;
  const charge = (pi?.latest_charge as Stripe.Charge | null) || null;
  const bt = (charge?.balance_transaction as Stripe.BalanceTransaction | null) || null;
  const taxCents = session.total_details?.amount_tax ?? 0;
  const priceCents = (session.amount_total ?? 0) - taxCents;
  const tier = (meta.tier === "studio" ? "studio" : "pro") as SellerTier;
  const stripeFee = bt?.fee ?? Math.round((session.amount_total ?? 0) * 0.029) + 30;
  // A bundle pays the fixed part of our fee once, not once per book
  const fee = platformFeeCents(priceCents, tier);
  const email = (session.customer_details?.email || session.customer_email || "").toLowerCase();
  const name = session.customer_details?.name || "";

  // A signed-in buyer, or an account that already uses this email
  let buyerId = meta.buyer_user_id || null;
  if (!buyerId && email) {
    const { data: p } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    buyerId = (p?.id as string | null) || null;
  }

  const { data: projects } = await admin.from("projects").select("id, title, direct_sale").in("id", projectIds);
  const byId = new Map((projects || []).map((p) => [p.id as string, p]));
  const books = projectIds.map((id) => ({ id, title: (byId.get(id)?.title as string) || meta.title || "Your ebook", weight: normalizeDirectSale(byId.get(id)?.direct_sale).priceCents }));
  const weights = books.map((b) => b.weight);
  const prices = allocate(priceCents, weights);
  const taxes = allocate(taxCents, weights);
  const stripeFees = allocate(stripeFee, weights);
  const fees = allocate(fee, weights);
  const availableAt = new Date(Date.now() + REFUND_WINDOW_DAYS * DAY_MS).toISOString();

  const rows = books.map((b, i) => ({
    project_id: b.id,
    author_user_id: authorId,
    buyer_user_id: buyerId,
    buyer_email: email,
    buyer_name: name.slice(0, 120),
    title: b.title,
    price_cents: prices[i],
    tax_cents: taxes[i],
    stripe_fee_cents: stripeFees[i],
    platform_fee_cents: fees[i],
    author_cents: prices[i] - stripeFees[i] - fees[i],
    currency: session.currency || "usd",
    // The first book carries the session id itself, which keeps a replayed webhook from recording twice
    stripe_session_id: i === 0 ? session.id : `${session.id}#${i + 1}`,
    order_ref: session.id,
    bundle_id: meta.bundle_id || null,
    stripe_payment_intent: pi?.id || null,
    stripe_charge_id: charge?.id || null,
    available_at: availableAt,
    download_token: token(),
  }));
  let { data: inserted, error } = await admin.from("book_purchases").insert(rows).select("id, title, project_id, download_token");
  // Before migration_direct_sales_3.sql: single books only, without the order columns
  if (error && /order_ref|bundle_id/.test(error.message) && rows.length === 1) {
    const legacy = rows.map((r) => {
      const copy: Record<string, unknown> = { ...r };
      delete copy.order_ref;
      delete copy.bundle_id;
      return copy;
    });
    ({ data: inserted, error } = await admin.from("book_purchases").insert(legacy).select("id, title, project_id, download_token"));
  }
  if (error || !inserted?.length) {
    if (error && /duplicate|unique/i.test(error.message)) return { ok: true, skipped: "already_recorded" };
    throw new Error(error?.message || "Purchase not recorded");
  }

  await recordRevenue(admin, { stripeRef: `sale:${session.id}`, kind: "sales_fee", amountCents: fee, occurredAt: new Date().toISOString(), userId: authorId }).catch(() => null);

  if (meta.code_id) {
    const { data: c } = await admin.from("discount_codes").select("uses").eq("id", meta.code_id).maybeSingle();
    if (c) await admin.from("discount_codes").update({ uses: (c.uses || 0) + 1 }).eq("id", meta.code_id);
    await admin.from("book_purchases").update({ discount_code_id: meta.code_id, regular_price_cents: Number(meta.regular_cents) || null }).eq("id", inserted[0].id);
  }

  if (buyerId) for (const r of inserted) await addToLibrary(admin, buyerId, r.project_id, r.title, "purchased").catch(() => null);

  const what = meta.bundle_id ? meta.title || `${inserted.length} books` : inserted[0].title;
  if (email) {
    const mail = renderEmail({
      heading: `Your copy of ${what}`,
      paragraphs: [
        meta.bundle_id
          ? `Thank you for buying ${what} direct from the author. All ${inserted.length} ebooks are ready to download from the page below, and the link keeps working whenever you need them again.`
          : `Thank you for buying ${what} direct from the author. Your ebook is ready to download, and this link keeps working whenever you need it again.`,
        `You paid ${dollars(session.amount_total ?? 0)}${taxCents ? ` including ${dollars(taxCents)} tax` : ""}. Changed your mind? You can ask for a refund within ${REFUND_WINDOW_DAYS} days by replying to this email.`,
        buyerId ? "It's also in your Novelist Writer library." : "Create a free reader account with this email to keep it in your library, along with any book you buy later.",
      ],
      button: { label: meta.bundle_id ? "Download your ebooks" : "Download your ebook", url: appUrl(`/purchase/${inserted[0].download_token}`) },
    });
    await sendEmail({ to: email, subject: `Your copy of ${what}`, text: mail.text, html: mail.html }).catch(() => null);
  }

  const authorShare = rows.reduce((n, r) => n + r.author_cents, 0);
  await notifyUser(admin, authorId, {
    type: "book_sale",
    title: meta.bundle_id ? `You sold ${what}` : `You sold a copy of ${what}`,
    body: `${dollars(priceCents)} sale; ${dollars(authorShare)} is yours after fees. Payouts go out monthly.`,
    href: `/project/${projectIds[0]}?tab=publish`,
  }).catch(() => null);
  return { ok: true, applied: meta.bundle_id ? "bundle_purchase" : "book_purchase" };
}

/** Refunds: Stripe keeps its fee, so that comes off the author's share; our fee is given back. Covers every book in the order. */
export async function adjustBookPurchaseForCharge(admin: SupabaseClient, charge: Stripe.Charge, reason: "refunded" | "disputed") {
  const { data: rows } = await admin.from("book_purchases").select("*").eq("stripe_charge_id", charge.id);
  const open = (rows || []).filter((p) => p.status === "paid");
  if (!open.length) return false;
  if (reason === "refunded" && charge.amount_refunded < charge.amount) return true;
  const now = new Date().toISOString();
  for (const p of open) {
    await admin.from("book_purchases").update({ status: reason, author_cents: -p.stripe_fee_cents, platform_fee_cents: 0, refunded_at: now }).eq("id", p.id);
  }
  const feeBack = open.reduce((n, p) => n + p.platform_fee_cents, 0);
  const ref = (open[0].order_ref as string | null) || open[0].stripe_session_id;
  await recordRevenue(admin, { stripeRef: `sale-${reason}:${ref}`, kind: "sales_fee", amountCents: -feeBack, occurredAt: now, userId: open[0].author_user_id }).catch(() => null);
  return true;
}

/** Was this payment a book sale? Used to keep book money out of the subscription revenue records. */
export async function isBookPayment(admin: SupabaseClient, paymentIntentId: string | null | undefined) {
  if (!paymentIntentId) return false;
  const { data } = await admin.from("book_purchases").select("id").eq("stripe_payment_intent", paymentIntentId).limit(1);
  return Boolean(data?.length);
}

/* ---------- Payouts ---------- */

export type SellerPayoutRun = { paid: number; paidCents: number; failed: number; skipped: number; errors: string[] };

/** Monthly: pays every author whose released sales add up to at least $50. Safe to run more than once. */
export async function runSellerPayouts(admin: SupabaseClient, opts: { timeBudgetMs?: number } = {}): Promise<SellerPayoutRun> {
  const stopAt = Date.now() + (opts.timeBudgetMs ?? 20_000);
  const out: SellerPayoutRun = { paid: 0, paidCents: 0, failed: 0, skipped: 0, errors: [] };
  const { data: sellers, error } = await admin.from("seller_accounts").select("user_id, stripe_account_id").not("stripe_account_id", "is", null);
  if (error) return out;
  const stripe = getStripe();
  const now = new Date().toISOString();
  for (const s of sellers || []) {
    if (Date.now() > stopAt) break;
    const { data: ready } = await admin.from("book_purchases").select("id, author_cents").eq("author_user_id", s.user_id).is("payout_id", null).lte("available_at", now);
    const total = (ready || []).reduce((n, r) => n + r.author_cents, 0);
    if (!ready?.length || total < PAYOUT_MIN_CENTS) {
      out.skipped += 1;
      continue;
    }
    if (!(await refreshSellerPayouts(admin, s.user_id).catch(() => false))) {
      out.skipped += 1;
      continue;
    }
    const ids = ready.map((r) => r.id).sort();
    const key = `sale-${createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 40)}`;
    try {
      const transfer = await stripe.transfers.create(
        { amount: total, currency: "usd", destination: s.stripe_account_id, description: "Novelist Writer ebook sales", metadata: { author_user_id: s.user_id, sales: String(ids.length) } },
        { idempotencyKey: key }
      );
      const { data: payout } = await admin.from("seller_payouts").insert({ author_user_id: s.user_id, amount_cents: total, stripe_transfer_id: transfer.id }).select("id").single();
      await admin.from("book_purchases").update({ payout_id: payout?.id || null }).in("id", ids);
      await notifyUser(admin, s.user_id, {
        type: "book_sale",
        title: `${dollars(total)} from your ebook sales is on its way`,
        body: "Stripe sends it to your bank on your payout schedule, usually within a few days.",
        href: "/dashboard",
      });
      out.paid += 1;
      out.paidCents += total;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transfer failed";
      await admin.from("seller_payouts").insert({ author_user_id: s.user_id, amount_cents: total, status: "failed", error: message.slice(0, 500) });
      out.failed += 1;
      out.errors.push(message);
    }
  }
  return out;
}

export type SellerSummary = {
  sales: number;
  /** Reader magnets delivered */
  freeCopies: number;
  refunds: number;
  grossCents: number;
  feesCents: number;
  earnedCents: number;
  onHoldCents: number;
  readyCents: number;
  paidCents: number;
  byBook: { projectId: string | null; title: string; sales: number; earnedCents: number }[];
  payouts: { createdAt: string; amountCents: number; status: string }[];
};

export async function sellerSummary(admin: SupabaseClient, userId: string): Promise<SellerSummary> {
  const now = Date.now();
  const [{ data: rows }, { data: payouts }] = await Promise.all([
    admin.from("book_purchases").select("project_id, title, price_cents, stripe_fee_cents, platform_fee_cents, author_cents, status, available_at, payout_id").eq("author_user_id", userId).limit(20000),
    admin.from("seller_payouts").select("amount_cents, status, created_at").eq("author_user_id", userId).order("created_at", { ascending: false }).limit(24),
  ]);
  const free = (rows || []).filter((r) => r.price_cents === 0);
  const all = (rows || []).filter((r) => r.price_cents > 0);
  const unpaid = all.filter((r) => !r.payout_id);
  const books = new Map<string, { projectId: string | null; title: string; sales: number; earnedCents: number }>();
  for (const r of all) {
    const k = r.project_id || r.title;
    const b = books.get(k) || { projectId: r.project_id, title: r.title, sales: 0, earnedCents: 0 };
    if (r.status === "paid") b.sales += 1;
    b.earnedCents += r.author_cents;
    books.set(k, b);
  }
  return {
    sales: all.filter((r) => r.status === "paid").length,
    freeCopies: free.length,
    refunds: all.filter((r) => r.status !== "paid").length,
    grossCents: all.filter((r) => r.status === "paid").reduce((n, r) => n + r.price_cents, 0),
    feesCents: all.reduce((n, r) => n + r.stripe_fee_cents + r.platform_fee_cents, 0),
    earnedCents: all.reduce((n, r) => n + r.author_cents, 0),
    onHoldCents: unpaid.filter((r) => Date.parse(r.available_at) > now).reduce((n, r) => n + r.author_cents, 0),
    readyCents: unpaid.filter((r) => Date.parse(r.available_at) <= now).reduce((n, r) => n + r.author_cents, 0),
    paidCents: all.filter((r) => r.payout_id).reduce((n, r) => n + r.author_cents, 0),
    byBook: [...books.values()].sort((a, b) => b.sales - a.sales),
    payouts: (payouts || []).map((p) => ({ createdAt: p.created_at, amountCents: p.amount_cents, status: p.status })),
  };
}

/* ---------- Delivery ---------- */

/** The buyer's own copy: the finished ebook with a page saying whose copy it is. No DRM. */
export async function buildPurchaseEpub(admin: SupabaseClient, purchase: { id: string; project_id: string | null; buyer_name: string; buyer_email: string }) {
  if (!purchase.project_id) throw new Error("This book is no longer available.");
  const { data: project } = await admin.from("projects").select("*").eq("id", purchase.project_id).maybeSingle();
  if (!project) throw new Error("This book is no longer available.");
  const [{ data: chapters }, { data: matter }, { data: profile }, cover, extras] = await Promise.all([
    admin.from("chapters").select("id, title, content_html, content_text, sort_order").eq("project_id", project.id).order("sort_order"),
    admin.from("matter_blocks").select("*").eq("project_id", project.id).order("sort_order"),
    admin.from("profiles").select("display_name").eq("id", project.user_id).maybeSingle(),
    loadCover(admin, project),
    loadBookExtras(admin, project, { store: "generic" }),
  ]);
  const owner = purchase.buyer_name || purchase.buyer_email;
  const notice = {
    matter_type: "front_custom",
    title: "Your copy",
    content_html: `<p>This copy belongs to ${escapeXml(owner)}${purchase.buyer_name && purchase.buyer_email ? ` (${escapeXml(purchase.buyer_email)})` : ""}. Thank you for buying direct from the author.</p><p>Please don't share or resell it.</p>`,
    enabled: true,
    sort_order: -1,
  };
  const format = normalizeFormat(project.format_settings);
  const style = getStyle(format.style);
  const book = buildBook({
    title: project.title || "Untitled",
    subtitle: project.subtitle || "",
    author: profile?.display_name || "Author",
    details: normalizeDetails(project.book_details),
    format,
    styleHeadingFormat: style.headingFormat,
    chapters: chapters || [],
    matter: [notice, ...(matter || [])],
    extras,
  });
  const buf = await buildStyledEpub({ book, style, identifier: `urn:uuid:${project.id}-sale-${purchase.id}`, cover, recordUrl: extras.recordUrl });
  const fileName = `${(project.title || "book").replace(/[^\w\- ]+/g, "").trim() || "book"}.epub`;
  return { buf, fileName };
}

/** Purchases for a signed-in reader: bought while signed in, or with the same email before they had an account. */
export async function purchasesFor(admin: SupabaseClient, userId: string, email: string | null) {
  const lower = String(email || "").toLowerCase();
  const [{ data: mine }, { data: byEmail }] = await Promise.all([
    admin.from("book_purchases").select("id, project_id, title, price_cents, status, created_at, download_token, buyer_user_id").eq("buyer_user_id", userId),
    lower ? admin.from("book_purchases").select("id, project_id, title, price_cents, status, created_at, download_token, buyer_user_id").ilike("buyer_email", lower).is("buyer_user_id", null) : Promise.resolve({ data: [] }),
  ]);
  // Claim email-only purchases for this account now that we know who they are
  const claim = (byEmail || []).map((p) => p.id);
  if (claim.length) await admin.from("book_purchases").update({ buyer_user_id: userId }).in("id", claim);
  return [...(mine || []), ...(byEmail || [])]
    .filter((p) => p.status === "paid")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((p) => ({ id: p.id, projectId: p.project_id, title: p.title, priceCents: p.price_cents, boughtAt: p.created_at, downloadUrl: `/purchase/${p.download_token}` }));
}

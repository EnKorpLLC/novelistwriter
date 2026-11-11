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
import { REFUND_WINDOW_DAYS, dollars, platformFeeCents, type SellerTier } from "@/lib/direct-sale-rules";
import { CANCEL_MINUTES, MIN_MARGIN_CENTS, PRINT_DAYS, SHIPPING_LEVELS, paperbackShare, podPackageId, type PrintFinish, type PrintPaper, type ShippingLevel } from "@/lib/print-rules";
import { SAMPLE_ADDRESS, cancelPrintJob, createPrintJob, luluConfigured, luluCost, readCheck, trackingOf, type LuluAddress, type PrintJob } from "@/lib/lulu";

/**
 * Paperbacks sold direct and printed by Lulu (physical sales PH1 and PH2). We're the seller: the buyer pays the price
 * plus shipping at cost; Lulu prints and ships the order and charges our card; the author's share is the price less
 * printing, our fee, and Stripe's fee, paid out 14 days after the book ships.
 */

export const PRINT_HINT = "Paperbacks need a database update. Run supabase/migration_print_sales.sql in the Supabase SQL editor.";
const DAY_MS = 86_400_000;
const token = () => randomBytes(24).toString("base64url");
const adminEmail = () => (process.env.PLATFORM_ADMIN_EMAIL || "ryan.jamison87@gmail.com").trim().toLowerCase();

export type EditionRow = {
  project_id: string;
  author_user_id: string;
  trim: string;
  paper: PrintPaper;
  finish: PrintFinish;
  page_count: number;
  interior_key: string | null;
  cover_key: string | null;
  interior_status: string;
  cover_status: string;
  interior_check_id: string | null;
  cover_check_id: string | null;
  file_errors: unknown;
  print_cost_cents: number | null;
  proof_ok_at: string | null;
  price_cents: number;
  sale_on: boolean;
  free_ebook: boolean;
};

export const printKey = (projectId: string, kind: "interior" | "cover") => `print/${projectId}/${kind}-${Date.now().toString(36)}.pdf`;
export const podOf = (e: Pick<EditionRow, "trim" | "paper" | "finish">) => podPackageId(e.trim, e.paper, e.finish);

/** This book's paperback edition (null if none yet, undefined before the migration). */
export async function editionFor(admin: SupabaseClient, projectId: string): Promise<EditionRow | null | undefined> {
  const { data, error } = await admin.from("print_editions").select("*").eq("project_id", projectId).maybeSingle();
  return error ? undefined : ((data as EditionRow | null) ?? null);
}

/** Bring Lulu's file checks up to date; the interior's real page count replaces the estimate. */
export async function refreshChecks(admin: SupabaseClient, e: EditionRow): Promise<EditionRow> {
  if (!luluConfigured()) return e;
  const patch: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const kind of ["interior", "cover"] as const) {
    const id = kind === "interior" ? e.interior_check_id : e.cover_check_id;
    const status = kind === "interior" ? e.interior_status : e.cover_status;
    if (!id || status !== "checking") continue;
    const r = await readCheck(kind, id).catch(() => null);
    if (!r) continue;
    patch[`${kind}_status`] = r.status;
    if (r.status === "error") errors.push(...r.errors.map((x) => `${kind === "interior" ? "Interior" : "Cover"}: ${x}`));
    if (kind === "interior" && r.pages && r.pages !== e.page_count) patch.page_count = r.pages;
  }
  if (!Object.keys(patch).length) return e;
  if (errors.length) patch.file_errors = errors;
  await admin.from("print_editions").update({ ...patch, updated_at: new Date().toISOString() }).eq("project_id", e.project_id);
  return { ...e, ...patch } as EditionRow;
}

/** Printing one copy (with Lulu's fulfillment fee) to a sample US address, cached on the edition. */
export async function refreshPrintCost(admin: SupabaseClient, e: EditionRow) {
  const pod = podOf(e);
  if (!pod || !luluConfigured() || e.page_count < 2) return e.print_cost_cents;
  const cost = await luluCost({ pod, pages: e.page_count, address: SAMPLE_ADDRESS, level: "MAIL" }).catch(() => null);
  if (!cost) return e.print_cost_cents;
  await admin.from("print_editions").update({ print_cost_cents: cost.printCents }).eq("project_id", e.project_id);
  return cost.printCents;
}

/** Why this paperback can't be bought yet (written for the author), or what's needed to sell it. */
export async function paperbackReadiness(admin: SupabaseClient, project: { id: string; user_id: string; published?: boolean | null }, opts: { proof?: boolean } = {}) {
  if (!luluConfigured()) return { ok: false as const, reason: "Paperback printing isn't connected yet." };
  const e = await editionFor(admin, project.id);
  if (e === undefined) return { ok: false as const, reason: PRINT_HINT };
  if (!e) return { ok: false as const, reason: "Set up the paperback first." };
  const pod = podOf(e);
  if (!pod) return { ok: false as const, reason: "Lulu doesn't print that trim size. Pick 5×8, 5.5×8.5, or 6×9." };
  if (e.interior_status !== "ok" || e.cover_status !== "ok") return { ok: false as const, reason: "Both files need to pass Lulu's check." };
  if (!e.print_cost_cents) return { ok: false as const, reason: "Waiting for Lulu's printing cost. Reload in a minute." };
  if (opts.proof) return { ok: true as const, edition: e, pod, tier: "pro" as SellerTier };
  const status = await sellerStatus(admin, project.user_id);
  if ("migrationNeeded" in status || !status.tier) return { ok: false as const, reason: "Selling direct is part of Pro and Studio." };
  if (!status.termsAccepted || !status.payoutsEnabled) return { ok: false as const, reason: "Finish setting up selling (seller terms and payouts) in the Sell tab." };
  if (!e.proof_ok_at) return { ok: false as const, reason: "Order a proof copy and confirm it looks right first." };
  if (!project.published) return { ok: false as const, reason: "Mark the book out now to start selling." };
  if (!e.sale_on) return { ok: false as const, reason: "Selling the paperback is turned off." };
  if (paperbackShare(e.price_cents, e.print_cost_cents, status.tier).authorCents < MIN_MARGIN_CENTS) return { ok: false as const, reason: "Raise the price: you'd keep less than $1.00 a copy." };
  return { ok: true as const, edition: e, pod, tier: status.tier };
}

/** Shipping prices at cost for each level, to the buyer's state and ZIP code (their street comes at checkout). */
export async function shippingQuotes(e: EditionRow, pod: string, state: string, zip: string) {
  const address: LuluAddress = { street1: "1 Main St", city: "City", state_code: state, postcode: zip, country_code: "US", phone_number: SAMPLE_ADDRESS.phone_number };
  const out: { id: ShippingLevel; label: string; note: string; cents: number; printCents: number }[] = [];
  for (const l of SHIPPING_LEVELS) {
    const c = await luluCost({ pod, pages: e.page_count, address, level: l.id }).catch(() => null);
    if (c) out.push({ id: l.id, label: l.label, note: l.note, cents: c.shippingCents, printCents: c.printCents });
  }
  return out;
}

/* ---------- After payment ---------- */

type SessionShipping = { name?: string | null; address?: Stripe.Address | null };
const shippingOf = (s: Stripe.Checkout.Session): SessionShipping | null => {
  const x = s as unknown as { shipping_details?: SessionShipping | null; collected_information?: { shipping_details?: SessionShipping | null } | null };
  return x.collected_information?.shipping_details || x.shipping_details || null;
};

/** checkout.session.completed for a paperback (or the author's proof): record it, then send it to Lulu. Safe to run twice. */
export async function recordPaperbackPurchase(admin: SupabaseClient, sessionId: string) {
  const { data: existing } = await admin.from("book_purchases").select("id").eq("stripe_session_id", sessionId).limit(1);
  if (existing?.length) return { ok: true, skipped: "already_recorded" };
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge.balance_transaction"] });
  if (session.payment_status !== "paid") return { ok: true, skipped: "not_paid" };
  const meta = session.metadata || {};
  const projectId = String(meta.project_id || "");
  const authorId = String(meta.author_user_id || "");
  const proof = meta.proof === "1";
  const pi = session.payment_intent as Stripe.PaymentIntent | null;
  const charge = (pi?.latest_charge as Stripe.Charge | null) || null;
  const bt = (charge?.balance_transaction as Stripe.BalanceTransaction | null) || null;
  const tax = session.total_details?.amount_tax ?? 0;
  const shipping = session.shipping_cost?.amount_subtotal ?? (Number(meta.ship_cents) || 0);
  const price = Math.max(0, (session.amount_total ?? 0) - tax - shipping);
  const stripeFee = bt?.fee ?? Math.round((session.amount_total ?? 0) * 0.029) + 30;
  const tier = (meta.tier === "studio" ? "studio" : "pro") as SellerTier;
  const printCents = Number(meta.print_cents) || 0;
  const fee = proof ? 0 : platformFeeCents(price, tier);
  const email = (session.customer_details?.email || "").toLowerCase();
  const name = session.customer_details?.name || "";
  let buyerId = meta.buyer_user_id || null;
  if (!buyerId && email) {
    const { data: p } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    buyerId = (p?.id as string | null) || null;
  }
  const ship = shippingOf(session);
  const a = ship?.address;
  const shipTo: LuluAddress | null = a
    ? { name: ship?.name || name, street1: a.line1 || "", street2: a.line2 || undefined, city: a.city || "", state_code: a.state || "", postcode: a.postal_code || "", country_code: a.country || "US", phone_number: session.customer_details?.phone || "" }
    : null;
  const title = String(meta.title || "Your book");
  const base = {
    project_id: projectId,
    author_user_id: authorId,
    buyer_user_id: buyerId,
    buyer_email: email,
    buyer_name: name.slice(0, 120),
    currency: session.currency || "usd",
    order_ref: session.id,
    stripe_payment_intent: pi?.id || null,
    stripe_charge_id: charge?.id || null,
  };
  const rows: Record<string, unknown>[] = [
    {
      ...base,
      title: proof ? `${title} (proof copy)` : `${title} (paperback)`,
      format: "paperback",
      is_proof: proof,
      price_cents: price,
      tax_cents: tax,
      shipping_cents: shipping,
      print_cost_cents: printCents,
      stripe_fee_cents: stripeFee,
      platform_fee_cents: fee,
      // A proof is at cost: nothing for the author or us
      author_cents: proof ? 0 : price - stripeFee - fee - printCents,
      stripe_session_id: session.id,
      available_at: proof ? new Date().toISOString() : PREORDER_HOLD,
      download_token: token(),
      ship_to: shipTo,
      ship_level: meta.ship_level || "MAIL",
    },
  ];
  // The free ebook that comes with the paperback: its own row (and download), no money of its own
  if (!proof && meta.free_ebook === "1") {
    rows.push({ ...base, title, format: "ebook", price_cents: 0, stripe_session_id: `${session.id}#ebook`, available_at: new Date().toISOString(), download_token: token() });
  }
  const { data: inserted, error } = await admin.from("book_purchases").insert(rows).select("id, format, download_token");
  if (error || !inserted?.length) {
    if (error && /duplicate|unique/i.test(error.message)) return { ok: true, skipped: "already_recorded" };
    throw new Error(error?.message || "Paperback purchase not recorded");
  }
  const book = inserted.find((r) => r.format === "paperback")!;
  if (!proof) await recordRevenue(admin, { stripeRef: `sale:${session.id}`, kind: "sales_fee", amountCents: fee, occurredAt: new Date().toISOString(), userId: authorId }).catch(() => null);
  if (buyerId && !proof) {
    const { data: entry } = await admin.from("library_entries").select("id, custom_shelves").eq("user_id", buyerId).eq("project_id", projectId).maybeSingle();
    if (entry) await admin.from("library_entries").update({ custom_shelves: [...new Set([...(entry.custom_shelves || []), "purchased"])] }).eq("id", entry.id);
    else await admin.from("library_entries").insert({ user_id: buyerId, project_id: projectId, title, source: "here", shelf: "want", custom_shelves: ["purchased"] }).then(() => null, () => null);
  }

  await sendToPrinter(admin, book.id as string);

  if (email) {
    const ebook = inserted.find((r) => r.format === "ebook");
    const mail = renderEmail({
      heading: proof ? `Your proof copy of ${title} is ordered` : `Your paperback of ${title} is ordered`,
      paragraphs: [
        `It's printed on demand by Lulu in ${PRINT_DAYS}, then shipped; you'll get an email with tracking when it's on its way.`,
        proof ? "When it arrives, check the cover, margins, and page order, then confirm it in the Sell tab." : `Changed your mind? You can cancel within ${CANCEL_MINUTES} minutes of ordering, before printing starts, from the page below.`,
        ebook ? "Your ebook is ready now too, from the same page." : "",
        `You paid ${dollars(session.amount_total ?? 0)}${tax ? ` including ${dollars(tax)} tax` : ""} and ${dollars(shipping)} shipping.`,
      ].filter(Boolean),
      button: { label: "See your order", url: appUrl(`/purchase/${book.download_token}`) },
    });
    await sendEmail({ to: email, subject: proof ? `Proof copy ordered: ${title}` : `Your paperback of ${title} is ordered`, text: mail.text, html: mail.html }).catch(() => null);
  }
  if (!proof) {
    await notifyUser(admin, authorId, {
      type: "book_sale",
      title: `You sold a paperback of ${title}`,
      body: `${dollars(price)} sale; about ${dollars(price - stripeFee - fee - printCents)} is yours after printing and fees, paid ${REFUND_WINDOW_DAYS} days after it ships.`,
      href: `/project/${projectId}?tab=sell`,
    }).catch(() => null);
  }
  return { ok: true, applied: proof ? "proof" : "paperback" };
}

/** Create the Lulu print job for a paid paperback order. A failure is retried daily, and refunded after 3 days. */
export async function sendToPrinter(admin: SupabaseClient, purchaseId: string) {
  const { data: p } = await admin.from("book_purchases").select("*").eq("id", purchaseId).maybeSingle();
  if (!p || p.status !== "paid" || p.print_job_id) return false;
  try {
    const e = await editionFor(admin, p.project_id);
    const pod = e ? podOf(e) : null;
    if (!e || !pod || !e.interior_key || !e.cover_key) throw new Error("The print files are missing.");
    if (!p.ship_to?.street1) throw new Error("No shipping address.");
    const week = 7 * 24 * 3600;
    const job: PrintJob = await createPrintJob({
      externalId: p.id,
      title: p.title,
      pod,
      interiorUrl: await signedDownloadUrl(e.interior_key, week),
      coverUrl: await signedDownloadUrl(e.cover_key, week),
      quantity: 1,
      address: p.ship_to,
      level: p.ship_level || "MAIL",
      contactEmail: process.env.LULU_CONTACT_EMAIL || adminEmail(),
    });
    const actual = job.costs?.total_cost_incl_tax ? Math.round(Number(job.costs.total_cost_incl_tax) * 100) : null;
    // If Lulu's real cost (printing and shipping) differs from what we charged, the difference comes out of (or back to) the author's share
    const expected = p.print_cost_cents + p.shipping_cents;
    const delta = actual && !p.is_proof ? expected - actual : 0;
    await admin
      .from("book_purchases")
      .update({ print_job_id: String(job.id), print_status: job.status?.name || "CREATED", print_error: null, ...(delta ? { author_cents: p.author_cents + delta } : {}) })
      .eq("id", p.id);
    return true;
  } catch (err) {
    const message = (err instanceof Error ? err.message : "Lulu didn't take the order").slice(0, 500);
    await admin.from("book_purchases").update({ print_status: "failed", print_error: message }).eq("id", p.id);
    const mail = renderEmail({ heading: "A paperback order didn't reach Lulu", paragraphs: [`"${p.title}" for ${p.buyer_email}: ${message}`, "It's retried daily and refunded after 3 days if it still fails."], button: { label: "Open Money", url: appUrl("/admin?tab=money") } });
    await sendEmail({ to: adminEmail(), subject: `Print order failed: ${p.title}`, text: mail.text, html: mail.html }).catch(() => null);
    return false;
  }
}

/** Refund a paperback order in full (cancelled before printing, or never accepted by Lulu). */
async function refundOrder(admin: SupabaseClient, p: Record<string, unknown>, why: string) {
  const stripe = getStripe();
  if (!p.stripe_payment_intent) throw new Error("This order can't be refunded automatically. Reply to your receipt email and we'll sort it out.");
  await stripe.refunds.create({ payment_intent: p.stripe_payment_intent as string, metadata: { reason: why, purchase_id: p.id as string } }, { idempotencyKey: `paperback-refund-${p.id}` });
  if (p.stripe_charge_id) await adjustBookPurchaseForCharge(admin, await stripe.charges.retrieve(p.stripe_charge_id as string), "refunded");
}

/** The buyer cancels within the hour, before Lulu starts printing. */
export async function cancelPaperback(admin: SupabaseClient, downloadToken: string) {
  const { data: p } = await admin.from("book_purchases").select("*").eq("download_token", downloadToken).maybeSingle();
  if (!p || p.format !== "paperback" || p.status !== "paid") throw new Error("This order can't be cancelled.");
  if (Date.now() - Date.parse(p.created_at) > CANCEL_MINUTES * 60_000) throw new Error("Printing has started, so it can't be cancelled now. If something's wrong when it arrives, reply to your receipt email.");
  if (p.print_job_id) await cancelPrintJob(p.print_job_id);
  await admin.from("book_purchases").update({ print_status: "CANCELED" }).eq("id", p.id);
  await refundOrder(admin, p, "buyer_cancelled");
  await notifyUser(admin, p.author_user_id, { type: "book_sale", title: `A paperback order of ${p.title} was cancelled`, body: "The buyer cancelled before printing and was refunded.", href: `/project/${p.project_id}?tab=sell` }).catch(() => null);
}

/** Lulu's webhook: the job moved on. Shipping starts the author's payout clock and emails the buyer tracking. */
export async function applyPrintStatus(admin: SupabaseClient, job: PrintJob & { external_id?: string }) {
  const { data: p } = await admin.from("book_purchases").select("*").eq("print_job_id", String(job.id)).maybeSingle();
  if (!p) return false;
  const name = job.status?.name || "";
  if (!name || name === p.print_status) return true;
  const patch: Record<string, unknown> = { print_status: name };
  if (name === "SHIPPED" && !p.shipped_at) {
    const track = trackingOf(job);
    const now = new Date();
    Object.assign(patch, { shipped_at: now.toISOString(), tracking_url: track?.url || null, ...(p.is_proof ? {} : { available_at: new Date(now.getTime() + REFUND_WINDOW_DAYS * DAY_MS).toISOString() }) });
    if (p.buyer_email) {
      const mail = renderEmail({
        heading: `${p.title.replace(/ \((paperback|proof copy)\)$/, "")} is on its way`,
        paragraphs: [track ? `It shipped${track.carrier ? ` with ${track.carrier}` : ""}. Track it from the link below.` : "It shipped. Tracking will show on your order page if the carrier provides it."],
        button: { label: track ? "Track it" : "See your order", url: track?.url || appUrl(`/purchase/${p.download_token}`) },
      });
      await sendEmail({ to: p.buyer_email, subject: `Shipped: ${p.title}`, text: mail.text, html: mail.html }).catch(() => null);
    }
  }
  if (name === "REJECTED" || name === "ERROR") {
    patch.print_error = job.status?.message || name;
    const msg = [`Lulu ${name === "REJECTED" ? "rejected" : "couldn't print"} the order for "${p.title}": ${job.status?.message || "no reason given"}.`];
    await notifyUser(admin, p.author_user_id, { type: "book_sale", title: `A paperback order needs attention`, body: msg[0], href: `/project/${p.project_id}?tab=sell` }).catch(() => null);
    const mail = renderEmail({ heading: "Print order problem", paragraphs: msg, button: { label: "Open admin", url: appUrl("/admin?tab=money") } });
    await sendEmail({ to: adminEmail(), subject: `Print order ${name.toLowerCase()}: ${p.title}`, text: mail.text, html: mail.html }).catch(() => null);
  }
  await admin.from("book_purchases").update(patch).eq("id", p.id);
  // Lulu cancelled it themselves (we cancel before refunding, so this only catches theirs)
  if (name === "CANCELED" && p.print_status !== "CANCELED" && p.status === "paid") await refundOrder(admin, p, "printer_cancelled").catch(() => null);
  return true;
}

/** Daily: retry orders that didn't reach Lulu; after 3 days, refund them. */
export async function sweepPrintOrders(admin: SupabaseClient, opts: { timeBudgetMs: number }) {
  const stopAt = Date.now() + opts.timeBudgetMs;
  const { data, error } = await admin.from("book_purchases").select("*").eq("format", "paperback").eq("status", "paid").eq("print_status", "failed").limit(50);
  if (error || !data?.length) return 0;
  let n = 0;
  for (const p of data) {
    if (Date.now() > stopAt) break;
    if (Date.now() - Date.parse(p.created_at) > 3 * DAY_MS) {
      await refundOrder(admin, p, "print_failed").catch(() => null);
      if (p.buyer_email) {
        const mail = renderEmail({ heading: `We refunded your order of ${p.title}`, paragraphs: ["The printer couldn't take this order, so we've refunded you in full. Sorry about that. It can take a few days to show on your statement."] });
        await sendEmail({ to: p.buyer_email, subject: `Refunded: ${p.title}`, text: mail.text, html: mail.html }).catch(() => null);
      }
    } else if (await sendToPrinter(admin, p.id)) n++;
  }
  return n;
}

import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, appUrl } from "@/lib/stripe";
import { deleteObject, r2Configured } from "@/lib/r2";
import { renderEmail, sendEmail } from "@/lib/email";
import { recordRevenue } from "@/lib/money";
import { refreshSellerPayouts } from "@/lib/direct-sales";
import { jobFromRow, type NarratorJob } from "@/lib/narration-access";
import { NARRATION_FEE_PCT, dollars, estimateCost } from "@/lib/narration";

/**
 * Narrator money (audiobook A4c). We're the merchant: the author pays us (narrator fee + our 10%), we hold it,
 * and the narrator is paid their full fee through Connect Express, each transfer drawn from the payment it
 * came from. Per-finished-hour jobs only; royalty shares are paid from direct audiobook sales (A5).
 */

export const MONEY_HINT = "Narrator payments need a database update. Run supabase/migration_narration_payments.sql in the Supabase SQL editor.";
const DAY_MS = 86_400_000;
export const AUTO_APPROVE_DAYS = 14;

const withFee = (narratorCents: number) => Math.round(narratorCents * (1 + NARRATION_FEE_PCT / 100));
const narratorShare = (amountCents: number) => Math.round(amountCents / (1 + NARRATION_FEE_PCT / 100));

async function emailUser(admin: SupabaseClient, userId: string | null, subject: string, paragraphs: string[], path: string, label: string) {
  if (!userId) return;
  const { data } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (!data?.email) return;
  const mail = renderEmail({ heading: subject, paragraphs, button: { label, url: appUrl(path) } });
  await sendEmail({ to: data.email as string, subject, text: mail.text, html: mail.html }).catch(() => null);
}

/** Finished length: the approved chapters as the author heard them in their review copies. */
export async function finishedMs(admin: SupabaseClient, projectId: string): Promise<number> {
  const [{ data: approved }, { data: copies }] = await Promise.all([
    admin.from("audio_chapters").select("chapter_id").eq("project_id", projectId).eq("status", "approved"),
    admin.from("audio_review_copies").select("chapter_id, duration_ms, created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
  ]);
  const ok = new Set((approved || []).map((a) => a.chapter_id as string));
  const seen = new Set<string>();
  let ms = 0;
  for (const c of copies || []) {
    const ch = c.chapter_id as string;
    if (!ok.has(ch) || seen.has(ch)) continue;
    seen.add(ch);
    ms += Number(c.duration_ms) || 0;
  }
  return ms;
}

export type JobMoney = {
  pay: "per_finished_hour" | "royalty_share";
  depositDue: number;
  depositPaid: number;
  finishedMs: number;
  finalFee: number;
  finalTotal: number;
  balanceDue: number;
  paidToNarrator: number;
  pendingToNarrator: number;
  delivered: { name: string; bytes: number }[];
  depositPaidAt: string | null;
  deliveredAt: string | null;
  finalPaidAt: string | null;
};

/** Where a job's money stands, for both dashboards. */
export async function jobMoney(admin: SupabaseClient, jobRow: Record<string, unknown>): Promise<JobMoney | null> {
  const job = jobFromRow(jobRow);
  const [payments, payouts, deliveries] = await Promise.all([
    admin.from("narration_payments").select("kind, amount_cents, narrator_cents, refunded_cents, status").eq("job_id", job.id),
    admin.from("narration_payouts").select("amount_cents, status").eq("job_id", job.id),
    admin.from("narration_deliveries").select("file_name, bytes").eq("job_id", job.id).is("deleted_at", null).order("file_name"),
  ]);
  if (payments.error || payouts.error) return null;
  const est = estimateCost(job.terms);
  const depositPaid = (payments.data || []).filter((p) => p.kind === "deposit" && p.status !== "refunded").reduce((n, p) => n + p.amount_cents - p.refunded_cents, 0);
  const ms = Number(jobRow.finished_ms) || (await finishedMs(admin, job.projectId));
  const finalFee = Math.round((job.terms.rateCents * ms) / 3_600_000);
  const finalTotal = withFee(finalFee);
  const finalPaid = (payments.data || []).filter((p) => p.kind === "final").reduce((n, p) => n + p.amount_cents - p.refunded_cents, 0);
  return {
    pay: job.terms.pay,
    depositDue: est.deposit,
    depositPaid,
    finishedMs: ms,
    finalFee,
    finalTotal,
    balanceDue: jobRow.final_paid_at ? 0 : Math.max(0, finalTotal - depositPaid - finalPaid),
    paidToNarrator: (payouts.data || []).filter((p) => p.status === "paid").reduce((n, p) => n + p.amount_cents, 0),
    pendingToNarrator: (payouts.data || []).filter((p) => p.status === "pending" || p.status === "failed").reduce((n, p) => n + p.amount_cents, 0),
    delivered: (deliveries.data || []).map((d) => ({ name: d.file_name as string, bytes: Number(d.bytes) || 0 })),
    depositPaidAt: (jobRow.deposit_paid_at as string) || null,
    deliveredAt: (jobRow.delivered_at as string) || null,
    finalPaidAt: (jobRow.final_paid_at as string) || null,
  };
}

/** Stripe Checkout for the author: the deposit (half the estimate) or the balance on delivery. */
export async function narrationCheckoutUrl(admin: SupabaseClient, jobRow: Record<string, unknown>, kind: "deposit" | "final", authorEmail: string | null, book: string): Promise<string> {
  const job = jobFromRow(jobRow);
  if (job.terms.pay !== "per_finished_hour") throw new Error("Royalty-share jobs have no up-front payments.");
  const money = await jobMoney(admin, jobRow);
  if (!money) throw new Error(MONEY_HINT);
  if (kind === "deposit" && money.depositPaid > 0) throw new Error("The deposit is already paid.");
  const amount = kind === "deposit" ? money.depositDue : money.balanceDue;
  if (amount < 50) throw new Error(kind === "final" ? "Nothing more is owed." : "The deposit is too small to charge.");
  const meta = { kind: "narration", narration_kind: kind, job_id: job.id, project_id: job.projectId, author_user_id: job.authorId };
  const back = appUrl(`/project/${job.projectId}?tab=audio`);
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: kind === "deposit" ? `Narration deposit: "${book}"` : `Narration balance: "${book}"`,
            description:
              kind === "deposit"
                ? `Half the estimated narration fee for ${job.narratorName || "your narrator"}, plus Novelist Writer's ${NARRATION_FEE_PCT}%. Held until delivery.`
                : `The rest of the narration fee for ${(money.finishedMs / 3_600_000).toFixed(2)} finished hours, plus Novelist Writer's ${NARRATION_FEE_PCT}%.`,
          },
        },
        quantity: 1,
      },
    ],
    ...(authorEmail ? { customer_email: authorEmail } : {}),
    success_url: `${back}&narration=${kind}-paid`,
    cancel_url: back,
    metadata: meta,
    payment_intent_data: { metadata: meta },
  });
  if (!session.url) throw new Error("Checkout isn't available right now. Try again in a moment.");
  return session.url;
}

/** Pays one pending payout, if the narrator's Stripe account can receive it. */
async function transferPayout(admin: SupabaseClient, payout: { id: string; narrator_id: string; amount_cents: number; payment_id: string | null; job_id: string }) {
  const { data: acct } = await admin.from("seller_accounts").select("stripe_account_id").eq("user_id", payout.narrator_id).maybeSingle();
  if (!acct?.stripe_account_id || !(await refreshSellerPayouts(admin, payout.narrator_id).catch(() => false))) return false;
  const { data: pay } = payout.payment_id ? await admin.from("narration_payments").select("stripe_charge_id, status").eq("id", payout.payment_id).maybeSingle() : { data: null };
  if (pay && pay.status !== "paid") return false;
  try {
    const transfer = await getStripe().transfers.create(
      {
        amount: payout.amount_cents,
        currency: "usd",
        destination: acct.stripe_account_id as string,
        ...(pay?.stripe_charge_id ? { source_transaction: pay.stripe_charge_id as string } : {}),
        description: "Novelist Writer narration",
        metadata: { narration_payout_id: payout.id, job_id: payout.job_id },
      },
      { idempotencyKey: `narration-payout-${payout.id}` }
    );
    await admin.from("narration_payouts").update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: new Date().toISOString(), error: null }).eq("id", payout.id);
    return true;
  } catch (e) {
    await admin.from("narration_payouts").update({ status: "failed", error: (e instanceof Error ? e.message : "Transfer failed").slice(0, 500) }).eq("id", payout.id);
    return false;
  }
}

/** Daily: retry payouts waiting on a narrator's payout setup (or a failed transfer). */
export async function payPendingNarratorPayouts(admin: SupabaseClient, opts: { timeBudgetMs: number }) {
  const stopAt = Date.now() + opts.timeBudgetMs;
  const { data, error } = await admin.from("narration_payouts").select("id, narrator_id, amount_cents, payment_id, job_id").in("status", ["pending", "failed"]).limit(100);
  if (error) return 0;
  let n = 0;
  for (const p of data || []) {
    if (Date.now() > stopAt) break;
    if (await transferPayout(admin, p as Parameters<typeof transferPayout>[1])) n++;
  }
  return n;
}

/** Queue the narrator's money from a payment, and try to send it now. */
async function owe(admin: SupabaseClient, job: NarratorJob, paymentId: string | null, amount: number, reason: string) {
  if (!job.narratorId || amount <= 0) return;
  const { data } = await admin.from("narration_payouts").insert({ job_id: job.id, narrator_id: job.narratorId, payment_id: paymentId, amount_cents: amount, reason }).select("id, narrator_id, amount_cents, payment_id, job_id").single();
  if (data) await transferPayout(admin, data as Parameters<typeof transferPayout>[1]);
}

/** Partial refund to the author from a payment, recorded against our revenue for our share. */
async function refundFrom(admin: SupabaseClient, payment: { id: string; stripe_payment_intent: string | null; amount_cents: number; platform_cents: number; refunded_cents: number }, cents: number, why: string) {
  const amount = Math.min(cents, payment.amount_cents - payment.refunded_cents);
  if (amount < 50 || !payment.stripe_payment_intent) return 0;
  const refund = await getStripe().refunds.create({ payment_intent: payment.stripe_payment_intent, amount, metadata: { narration_payment_id: payment.id, reason: why } }, { idempotencyKey: `narration-refund-${payment.id}-${amount}-${why}` });
  await admin.from("narration_payments").update({ refunded_cents: payment.refunded_cents + amount, status: payment.refunded_cents + amount >= payment.amount_cents ? "refunded" : "paid" }).eq("id", payment.id);
  await recordRevenue(admin, { stripeRef: `refund:${refund.id}`, kind: "refund", amountCents: -Math.round((amount * payment.platform_cents) / payment.amount_cents), occurredAt: new Date().toISOString() });
  return amount;
}

/**
 * Webhook: a narration Checkout was paid. Idempotent per session. The deposit approves the checkpoint (or starts
 * production); the balance completes the job, pays the narrator, and unlocks the files.
 */
export async function recordNarrationPayment(admin: SupabaseClient, sessionId: string) {
  const { data: prior } = await admin.from("narration_payments").select("id").eq("stripe_session_id", sessionId).maybeSingle();
  if (prior) return { ok: true, skipped: "already_recorded" };
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge.balance_transaction"] });
  if (session.payment_status !== "paid") return { ok: true, skipped: "not_paid" };
  const meta = session.metadata || {};
  const { data: row } = await admin.from("narrator_jobs").select("*").eq("id", meta.job_id || "").maybeSingle();
  if (!row) return { ok: false, skipped: "missing_job" };
  const job = jobFromRow(row);
  const kind = meta.narration_kind === "final" ? "final" : "deposit";
  const pi = session.payment_intent as Stripe.PaymentIntent | null;
  const charge = (pi?.latest_charge as Stripe.Charge | null) || null;
  const bt = (charge?.balance_transaction as Stripe.BalanceTransaction | null) || null;
  const amount = session.amount_total ?? 0;
  const narratorCents = narratorShare(amount);
  const platform = amount - narratorCents;
  const stripeFee = bt?.fee ?? Math.round(amount * 0.029) + 30;
  const { data: payment, error } = await admin
    .from("narration_payments")
    .insert({
      job_id: job.id,
      project_id: job.projectId,
      author_id: job.authorId,
      kind,
      amount_cents: amount,
      narrator_cents: narratorCents,
      platform_cents: platform,
      stripe_fee_cents: stripeFee,
      stripe_session_id: session.id,
      stripe_payment_intent: pi?.id || null,
      stripe_charge_id: charge?.id || null,
    })
    .select("*")
    .single();
  if (error || !payment) {
    if (/duplicate/i.test(error?.message || "")) return { ok: true, skipped: "already_recorded" };
    throw new Error(`narration payment not recorded: ${error?.message}`);
  }
  // Only our share is revenue; Stripe's fee comes out of it
  await recordRevenue(admin, { stripeRef: `narration:${session.id}`, kind: "sales_fee", amountCents: platform - stripeFee, occurredAt: new Date().toISOString(), userId: job.authorId });
  const now = new Date().toISOString();
  const { data: project } = await admin.from("projects").select("title").eq("id", job.projectId).maybeSingle();
  const book = (project?.title as string) || "the book";

  if (kind === "deposit") {
    await admin.from("narrator_jobs").update({ deposit_paid_at: now, ...(job.terms.checkpoint ? { checkpoint_status: "approved", checkpoint_at: now, checkpoint_note: null } : {}), updated_at: now }).eq("id", job.id);
    await emailUser(
      admin,
      job.narratorId,
      job.terms.checkpoint ? `Checkpoint approved: record the rest of "${book}"` : `Deposit paid: start recording "${book}"`,
      [`The author paid the deposit (${dollars(amount)}, held by Novelist Writer until delivery). You're clear for full production.`, "Set up payouts in your narrator dashboard if you haven't, so your fee can be sent the day the book is finished."],
      `/narrator/book/${job.id}`,
      "Open the studio"
    );
    return { ok: true, applied: "deposit" };
  }

  // The balance: complete the job and pay the narrator their full fee from both payments
  await admin.from("narrator_jobs").update({ final_paid_at: now, status: "completed", updated_at: now }).eq("id", job.id);
  const { data: deposits } = await admin.from("narration_payments").select("id, narrator_cents, refunded_cents, amount_cents").eq("job_id", job.id).eq("kind", "deposit");
  for (const d of deposits || []) await owe(admin, job, d.id as string, Math.max(0, d.narrator_cents - narratorShare(d.refunded_cents)), "deposit share");
  await owe(admin, job, payment.id as string, narratorCents, "final share");
  await emailUser(admin, job.narratorId, `"${book}" is paid in full`, ["The author paid the balance. Your fee is on its way to your bank through Stripe (usually a few days). Thank you for narrating!"], "/narrator", "Open your dashboard");
  await emailUser(admin, job.authorId, `Your audiobook files for "${book}" are ready`, ["Payment received. Download the finished files from the Audio tab; they're kept for 60 days."], `/project/${job.projectId}?tab=audio`, "Open the Audio tab");
  return { ok: true, applied: "final" };
}

/**
 * The narrator delivered and every chapter is approved, but the deposit already covers the finished length:
 * refund the difference, pay the narrator from the deposit, and complete the job without another charge.
 */
export async function settleFromDeposit(admin: SupabaseClient, jobRow: Record<string, unknown>) {
  const job = jobFromRow(jobRow);
  const money = await jobMoney(admin, jobRow);
  if (!money || money.balanceDue > 0) return false;
  const { data: deposits } = await admin.from("narration_payments").select("*").eq("job_id", job.id).eq("kind", "deposit");
  let over = money.depositPaid - money.finalTotal;
  for (const d of deposits || []) {
    if (over > 0) over -= await refundFrom(admin, d as Parameters<typeof refundFrom>[1], over, "under-estimate");
  }
  const now = new Date().toISOString();
  await admin.from("narrator_jobs").update({ final_paid_at: now, status: "completed", updated_at: now }).eq("id", job.id);
  let left = money.finalFee;
  for (const d of deposits || []) {
    const share = Math.min(left, d.narrator_cents);
    await owe(admin, job, d.id as string, share, "fee from deposit");
    left -= share;
  }
  return true;
}

/**
 * The author cancels after the deposit: the narrator is paid for approved audio plus the agreed cancellation fee on
 * the rest (capped at the deposit), and the remainder goes back to the author.
 */
export async function settleCancellation(admin: SupabaseClient, jobRow: Record<string, unknown>) {
  const job = jobFromRow(jobRow);
  const { data: deposits, error } = await admin.from("narration_payments").select("*").eq("job_id", job.id).eq("kind", "deposit");
  if (error || !deposits?.length) return { narratorCents: 0, refundedCents: 0 };
  const est = estimateCost(job.terms);
  const approvedFee = Math.round((job.terms.rateCents * (await finishedMs(admin, job.projectId))) / 3_600_000);
  const owed = approvedFee + Math.round((Math.max(0, est.fee - approvedFee) * job.terms.cancellationPct) / 100);
  let narratorCents = 0;
  let refundedCents = 0;
  for (const d of deposits) {
    const available = d.narrator_cents - narratorShare(d.refunded_cents);
    const share = Math.max(0, Math.min(available, owed - narratorCents));
    await owe(admin, job, d.id as string, share, "cancellation");
    narratorCents += share;
    // Refund what's left of this deposit, less our fee on the part the narrator keeps
    refundedCents += await refundFrom(admin, d as Parameters<typeof refundFrom>[1], d.amount_cents - d.refunded_cents - withFee(share), "cancelled");
  }
  return { narratorCents, refundedCents };
}

/** Daily: a delivered chapter the author hasn't answered in 14 days counts as approved, as the agreement says. */
export async function autoApproveQuietChapters(admin: SupabaseClient) {
  const cutoff = new Date(Date.now() - AUTO_APPROVE_DAYS * DAY_MS).toISOString();
  const { data: jobs, error } = await admin.from("narrator_jobs").select("*").eq("status", "active");
  if (error || !jobs?.length) return 0;
  let n = 0;
  for (const row of jobs) {
    const { data: waiting } = await admin.from("audio_chapters").select("chapter_id, updated_at").eq("project_id", row.project_id).eq("status", "review").lt("updated_at", cutoff);
    for (const c of waiting || []) {
      await admin.from("audio_chapters").update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("chapter_id", c.chapter_id);
      n++;
    }
    if (waiting?.length) {
      const job = jobFromRow(row);
      const msg = [`${waiting.length} chapter${waiting.length === 1 ? " was" : "s were"} waiting for review for ${AUTO_APPROVE_DAYS} days, so under the agreement ${waiting.length === 1 ? "it counts" : "they count"} as approved.`];
      await emailUser(admin, job.authorId, "Chapters approved automatically", msg, `/project/${job.projectId}?tab=audio`, "Open the Audio tab");
      await emailUser(admin, job.narratorId, "Chapters approved automatically", msg, `/narrator/book/${job.id}`, "Open the studio");
    }
  }
  return n;
}

/** Narrators get paid through the same kind of Stripe Express account sellers and affiliates use; one per person. */
export async function narratorPayoutUrl(admin: SupabaseClient, userId: string, email: string | null) {
  const stripe = getStripe();
  const { data: existing } = await admin.from("seller_accounts").select("stripe_account_id").eq("user_id", userId).maybeSingle();
  let accountId = (existing?.stripe_account_id as string | null) || null;
  if (!accountId) {
    const { data: aff } = await admin.from("affiliates").select("stripe_account_id").eq("user_id", userId).maybeSingle();
    accountId = (aff?.stripe_account_id as string | null) || null;
  }
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: email || undefined,
      capabilities: { transfers: { requested: true } },
      business_profile: { product_description: "Audiobook narration through Novelist Writer", url: appUrl("/") },
      metadata: { supabase_user_id: userId },
    });
    accountId = account.id;
  }
  await admin.from("seller_accounts").upsert({ user_id: userId, stripe_account_id: accountId });
  const link = await stripe.accountLinks.create({ account: accountId, refresh_url: appUrl("/narrator?payouts=refresh"), return_url: appUrl("/narrator?payouts=done"), type: "account_onboarding" });
  return link.url;
}

/** Daily: delivered files are kept 60 days after the job is paid in full, then removed from storage. */
export async function sweepDeliveries(admin: SupabaseClient, opts: { timeBudgetMs: number }) {
  if (!r2Configured()) return 0;
  const stopAt = Date.now() + opts.timeBudgetMs;
  const cutoff = new Date(Date.now() - 60 * DAY_MS).toISOString();
  const { data: jobs, error } = await admin.from("narrator_jobs").select("id").lt("final_paid_at", cutoff).limit(50);
  if (error || !jobs?.length) return 0;
  const { data: files } = await admin.from("narration_deliveries").select("id, r2_key").in("job_id", jobs.map((j) => j.id)).is("deleted_at", null).limit(500);
  let n = 0;
  for (const f of files || []) {
    if (Date.now() > stopAt) break;
    await deleteObject(f.r2_key as string).catch(() => null);
    await admin.from("narration_deliveries").update({ deleted_at: new Date().toISOString() }).eq("id", f.id);
    n++;
  }
  return n;
}

/** Is this Stripe payment a narration payment? (Refunds and disputes on these are handled here, not as revenue.) */
export async function isNarrationPayment(admin: SupabaseClient, paymentIntentId: string | null | undefined) {
  if (!paymentIntentId) return false;
  const { data } = await admin.from("narration_payments").select("id").eq("stripe_payment_intent", paymentIntentId).limit(1);
  return Boolean(data?.length);
}

/** A disputed narration charge: hold anything not yet sent to the narrator, and tell the admin. */
export async function disputeNarrationCharge(admin: SupabaseClient, chargeId: string) {
  const { data: pay } = await admin.from("narration_payments").select("id, job_id").eq("stripe_charge_id", chargeId).maybeSingle();
  if (!pay) return false;
  await admin.from("narration_payments").update({ status: "disputed" }).eq("id", pay.id);
  await admin.from("narration_payouts").update({ status: "cancelled", error: "Payment disputed" }).eq("payment_id", pay.id).in("status", ["pending", "failed"]);
  return true;
}

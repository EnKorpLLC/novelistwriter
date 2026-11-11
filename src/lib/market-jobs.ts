import "server-only";
import { randomBytes, randomUUID } from "crypto";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, appUrl } from "@/lib/stripe";
import { renderEmail, sendEmail } from "@/lib/email";
import { recordRevenue } from "@/lib/money";
import { refreshSellerPayouts } from "@/lib/direct-sales";
import { deleteObject, r2Configured, signedDownloadUrl } from "@/lib/r2";
import { HIRING_LIVE, typeStatuses } from "@/lib/marketplace";
import { isMarketType, marketType } from "@/lib/market-types";
import {
  AUTO_APPROVE_DAYS,
  MARKET_FEE_PCT,
  MAX_REQUEST_PROS,
  agreementText,
  dollars,
  normalizeQuote,
  quoteProblem,
  withFee,
  type Quote,
} from "@/lib/market-quotes";

/**
 * Marketplace jobs: a request, the pro's quote, the agreement, and milestones the author pays as each starts. We're
 * the merchant: the author pays us the pro's price plus our fee, we hold it until the author approves the
 * delivery, then pay the pro their full price through Connect, drawn from the payment it came from.
 */

export const JOBS_HINT = "Hiring needs a database update. Run supabase/migration_market_jobs.sql in the Supabase SQL editor.";
const DAY_MS = 86_400_000;

export type JobRow = {
  id: string;
  request_id: string;
  author_id: string;
  pro_id: string | null;
  invite_email: string | null;
  invite_token: string | null;
  source: "directory" | "private";
  project_id: string | null;
  market_type: string;
  title: string;
  brief: string;
  deadline: string | null;
  budget_note: string;
  status: string;
  quote: unknown;
  quote_version: number;
  quoted_at: string | null;
  agreement_text: string | null;
  agreed_at: string | null;
  dispute_note: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  completed_at: string | null;
  created_at: string;
};
export type MilestoneRow = {
  id: string;
  job_id: string;
  sort: number;
  title: string;
  pro_cents: number;
  due_on: string | null;
  status: string;
  revisions_used: number;
  delivery_note: string;
  paid_at: string | null;
  delivered_at: string | null;
  approved_at: string | null;
  auto_approved: boolean;
};

async function emailUser(admin: SupabaseClient, userId: string | null, subject: string, paragraphs: string[], path: string, label: string) {
  if (!userId) return;
  const { data } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (!data?.email) return;
  const mail = renderEmail({ heading: subject, paragraphs, button: { label, url: appUrl(path) } });
  await sendEmail({ to: data.email as string, subject, html: mail.html, text: mail.text }).catch(() => null);
}

export const jobPath = (id: string) => `/hire/job/${id}`;
const nameOf = async (admin: SupabaseClient, userId: string | null) => {
  if (!userId) return "";
  const [{ data: pro }, { data: p }] = await Promise.all([
    admin.from("pro_profiles").select("name").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);
  return ((pro?.name as string) || (p?.display_name as string) || "").trim();
};

/** The job, if this user is its author or its pro. */
export async function jobFor(admin: SupabaseClient, jobId: string, userId: string): Promise<{ job: JobRow; role: "author" | "pro" } | null | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return null;
  const { data, error } = await admin.from("market_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) return undefined;
  if (!data) return null;
  const job = data as JobRow;
  if (job.author_id === userId) return { job, role: "author" };
  if (job.pro_id === userId) return { job, role: "pro" };
  return null;
}

export async function milestonesOf(admin: SupabaseClient, jobId: string): Promise<MilestoneRow[]> {
  const { data } = await admin.from("market_milestones").select("*").eq("job_id", jobId).order("sort");
  return (data || []) as MilestoneRow[];
}

/* ---------- Requests ---------- */

export type RequestInput = { type: string; projectId?: string | null; title: string; brief: string; deadline?: string | null; budgetNote?: string; proIds?: string[]; inviteEmail?: string | null };

/**
 * A request goes to up to five pros from the directory (their type must be open), or privately to the author's own
 * editor or artist by email (any type but narration, which has its own invites).
 */
export async function createRequest(admin: SupabaseClient, author: { id: string; email: string | null }, input: RequestInput) {
  if (!isMarketType(input.type) || input.type === "narration") throw new Error("Pick what you'd like to hire.");
  const title = String(input.title || "").trim().slice(0, 140);
  const brief = String(input.brief || "").trim().slice(0, 6000);
  if (!title) throw new Error("Give the job a short title, like “Copy edit of The Ember Coast”.");
  if (brief.length < 40) throw new Error("Tell them a little more in the brief: what you need, how long the book is, and when.");
  let projectId: string | null = null;
  if (input.projectId) {
    const { data: p } = await admin.from("projects").select("id").eq("id", input.projectId).eq("user_id", author.id).maybeSingle();
    projectId = (p?.id as string | null) || null;
  }
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(input.deadline || "")) ? String(input.deadline) : null;
  const base = {
    request_id: randomUUID(),
    author_id: author.id,
    project_id: projectId,
    market_type: input.type,
    title,
    brief,
    deadline,
    budget_note: String(input.budgetNote || "").trim().slice(0, 200),
  };
  const authorName = (await nameOf(admin, author.id)) || "An author";
  const t = marketType(input.type)!;

  const invite = String(input.inviteEmail || "").trim().toLowerCase();
  if (invite) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite)) throw new Error("Enter their email.");
    if (invite === (author.email || "").toLowerCase()) throw new Error("That's your own email.");
    const token = randomBytes(24).toString("base64url");
    const { data, error } = await admin.from("market_jobs").insert({ ...base, source: "private", invite_email: invite, invite_token: token }).select("id").single();
    if (error) throw new Error(JOBS_HINT);
    const mail = renderEmail({
      heading: `${authorName} would like to hire you`,
      paragraphs: [
        `${authorName} writes on Novelist Writer and would like a quote from you as a ${t.label.toLowerCase()}: "${title}".`,
        "Open the request to read the brief and send a quote. If they accept, they pay each milestone up front and it's held until they approve your delivery, then paid to you in full. Your account is free.",
      ],
      button: { label: "See the request", url: appUrl(`/hire/invite/${token}`) },
    });
    await sendEmail({ to: invite, subject: `${authorName} would like a quote: "${title}"`, html: mail.html, text: mail.text }).catch(() => null);
    return [data.id as string];
  }

  if (!HIRING_LIVE) throw new Error("The directory isn't open yet. Invite your own pro by email for now.");
  const status = (await typeStatuses(admin))?.find((s) => s.id === input.type);
  if (status?.state !== "open") throw new Error(`${t.plural} aren't open yet. Join the waitlist on the Hire help page, or invite your own pro by email.`);
  const ids = [...new Set((input.proIds || []).map(String))].filter((id) => id !== author.id).slice(0, MAX_REQUEST_PROS);
  if (!ids.length) throw new Error("Pick at least one pro.");
  const { data: pros } = await admin.from("pro_profiles").select("user_id, specialties").in("user_id", ids).eq("status", "approved");
  const ok = (pros || []).filter((p) => (p.specialties || []).includes(input.type)).map((p) => p.user_id as string);
  if (!ok.length) throw new Error("Those pros aren't available right now.");
  const { data, error } = await admin
    .from("market_jobs")
    .insert(ok.map((proId) => ({ ...base, source: "directory", pro_id: proId })))
    .select("id, pro_id");
  if (error) throw new Error(JOBS_HINT);
  for (const j of data || []) {
    await emailUser(admin, j.pro_id as string, `New request: "${title}"`, [`${authorName} would like a quote from you as a ${t.label.toLowerCase()}.`, brief.slice(0, 400)], jobPath(j.id as string), "Read the brief and quote");
  }
  return (data || []).map((j) => j.id as string);
}

/** A private invite: the invited email signs in and the job becomes theirs. */
export async function acceptInvite(admin: SupabaseClient, token: string, user: { id: string; email: string | null }) {
  const { data } = await admin.from("market_jobs").select("*").eq("invite_token", token).maybeSingle();
  if (!data) throw new Error("This invite isn't valid anymore.");
  const job = data as JobRow;
  if (job.pro_id && job.pro_id !== user.id) throw new Error("Someone else already accepted this invite.");
  if ((user.email || "").toLowerCase() !== (job.invite_email || "").toLowerCase()) throw new Error(`This invite is for ${job.invite_email}. Sign in with that email.`);
  if (job.author_id === user.id) throw new Error("You can't hire yourself.");
  if (!job.pro_id) await admin.from("market_jobs").update({ pro_id: user.id, updated_at: new Date().toISOString() }).eq("id", job.id);
  // Their pro profile can stay a draft: private work doesn't need the directory
  const { data: pro } = await admin.from("pro_profiles").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!pro) {
    await admin
      .from("pro_profiles")
      .insert({ user_id: user.id, name: await nameOf(admin, user.id), specialties: [job.market_type], invite_code: randomBytes(9).toString("base64url") })
      .then(() => null, () => null);
  }
  await admin.from("profiles").update({ is_pro: true }).eq("id", user.id).then(() => null, () => null);
  return job.id;
}

/* ---------- Quotes and the agreement ---------- */

export async function sendQuote(admin: SupabaseClient, job: JobRow, raw: unknown) {
  if (!["requested", "quoted"].includes(job.status)) throw new Error("This job isn't taking quotes anymore.");
  const quote = normalizeQuote(raw, job.market_type);
  const problem = quoteProblem(quote);
  if (problem) throw new Error(problem);
  const now = new Date().toISOString();
  await admin.from("market_jobs").update({ quote, quote_version: job.quote_version + 1, quoted_at: now, status: "quoted", updated_at: now }).eq("id", job.id);
  const pro = (await nameOf(admin, job.pro_id)) || "Your pro";
  await emailUser(
    admin,
    job.author_id,
    `${pro} sent a quote: "${job.title}"`,
    [`${dollars(withFee(quote.milestones.reduce((n, m) => n + m.cents, 0)))} in all, including our ${MARKET_FEE_PCT}% fee, in ${quote.milestones.length} ${quote.milestones.length === 1 ? "milestone" : "milestones"}.`],
    jobPath(job.id),
    "See the quote"
  );
}

/** The author accepts the quote they saw (by version): the agreement is fixed, milestones are set up, and other quotes close. */
export async function acceptQuote(admin: SupabaseClient, job: JobRow, version: number) {
  if (job.status !== "quoted") throw new Error("There's no quote to accept.");
  if (version !== job.quote_version) throw new Error("The pro updated their quote. Read the new one first.");
  const quote = normalizeQuote(job.quote, job.market_type);
  if (quoteProblem(quote)) throw new Error("This quote isn't complete.");
  const [author, pro, { data: book }] = await Promise.all([
    nameOf(admin, job.author_id),
    nameOf(admin, job.pro_id),
    job.project_id ? admin.from("projects").select("title").eq("id", job.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const text = agreementText({ title: job.title, marketType: job.market_type, book: (book?.title as string) || null }, quote, { author: author || "The author", pro: pro || "The pro" });
  const now = new Date().toISOString();
  await admin.from("market_milestones").delete().eq("job_id", job.id);
  const { error } = await admin.from("market_milestones").insert(quote.milestones.map((m, i) => ({ job_id: job.id, sort: i, title: m.title, pro_cents: m.cents, due_on: m.dueOn })));
  if (error) throw new Error(JOBS_HINT);
  await admin.from("market_jobs").update({ status: "agreed", agreement_text: text, agreed_at: now, updated_at: now }).eq("id", job.id);
  // The other pros asked in the same request hear it went elsewhere
  const { data: others } = await admin.from("market_jobs").select("id, pro_id").eq("request_id", job.request_id).neq("id", job.id).in("status", ["requested", "quoted"]);
  if (others?.length) {
    await admin.from("market_jobs").update({ status: "not_chosen", updated_at: now }).in("id", others.map((o) => o.id));
    for (const o of others) await emailUser(admin, o.pro_id as string, `"${job.title}" went to another pro`, ["Thanks for quoting. The author chose someone else this time."], "/pro", "Open your dashboard");
  }
  await emailUser(admin, job.pro_id, `Quote accepted: "${job.title}"`, [`${author || "The author"} accepted your quote. You'll hear when the first milestone is paid; don't start until then.`], jobPath(job.id), "Open the job");
}

/* ---------- Money ---------- */

/** The milestone the author can pay now: the first unpaid one, once everything before it is approved. */
export function payableMilestone(ms: MilestoneRow[]) {
  for (const m of ms) {
    if (m.status === "approved") continue;
    return m.status === "unpaid" ? m : null;
  }
  return null;
}

export async function marketCheckoutUrl(admin: SupabaseClient, job: JobRow, milestoneId: string, authorEmail: string | null) {
  if (job.status !== "agreed") throw new Error(job.status === "disputed" ? "This job is paused while we look at the dispute." : "This job isn't active.");
  const m = payableMilestone(await milestonesOf(admin, job.id));
  if (!m || m.id !== milestoneId) throw new Error("That milestone can't be paid yet: the one before it needs approving first.");
  const pro = (await nameOf(admin, job.pro_id)) || "your pro";
  const meta = { kind: "market", job_id: job.id, milestone_id: m.id, author_user_id: job.author_id };
  const back = appUrl(jobPath(job.id));
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: withFee(m.pro_cents),
          product_data: {
            name: `${m.title}: "${job.title}"`,
            description: `${dollars(m.pro_cents)} for ${pro}, plus Novelist Writer's ${MARKET_FEE_PCT}%. Held until you approve the delivery.`,
          },
        },
        quantity: 1,
      },
    ],
    ...(authorEmail ? { customer_email: authorEmail } : {}),
    success_url: `${back}?paid=1`,
    cancel_url: back,
    metadata: meta,
    payment_intent_data: { metadata: meta },
  });
  if (!session.url) throw new Error("Checkout isn't available right now. Try again in a moment.");
  return session.url;
}

/** Webhook: a milestone was paid. Idempotent per session. */
export async function recordMarketPayment(admin: SupabaseClient, sessionId: string) {
  const { data: prior } = await admin.from("market_payments").select("id").eq("stripe_session_id", sessionId).maybeSingle();
  if (prior) return { ok: true, skipped: "already_recorded" };
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge.balance_transaction"] });
  if (session.payment_status !== "paid") return { ok: true, skipped: "not_paid" };
  const meta = session.metadata || {};
  const { data: m } = await admin.from("market_milestones").select("*").eq("id", meta.milestone_id || "").maybeSingle();
  const { data: job } = await admin.from("market_jobs").select("*").eq("id", meta.job_id || "").maybeSingle();
  if (!m || !job) return { ok: false, skipped: "missing_job" };
  const pi = session.payment_intent as Stripe.PaymentIntent | null;
  const charge = (pi?.latest_charge as Stripe.Charge | null) || null;
  const bt = (charge?.balance_transaction as Stripe.BalanceTransaction | null) || null;
  const amount = session.amount_total ?? 0;
  const proCents = Math.min(m.pro_cents as number, amount);
  const platform = amount - proCents;
  const stripeFee = bt?.fee ?? Math.round(amount * 0.029) + 30;
  const { error } = await admin.from("market_payments").insert({
    job_id: job.id,
    milestone_id: m.id,
    amount_cents: amount,
    pro_cents: proCents,
    platform_cents: platform,
    stripe_fee_cents: stripeFee,
    stripe_session_id: session.id,
    stripe_payment_intent: pi?.id || null,
    stripe_charge_id: charge?.id || null,
  });
  if (error) {
    if (/duplicate/i.test(error.message)) return { ok: true, skipped: "already_recorded" };
    throw new Error(`market payment not recorded: ${error.message}`);
  }
  await recordRevenue(admin, { stripeRef: `market:${session.id}`, kind: "sales_fee", amountCents: platform - stripeFee, occurredAt: new Date().toISOString(), userId: job.author_id }).catch(() => null);
  await admin.from("market_milestones").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", m.id).eq("status", "unpaid");
  await emailUser(admin, job.pro_id, `Paid: start "${m.title}"`, [`The author paid "${m.title}" for "${job.title}" (${dollars(m.pro_cents)} to you, held until they approve your delivery). You're clear to start.`, "Set up payouts on your pro dashboard if you haven't, so you're paid the day it's approved."], jobPath(job.id), "Open the job");
  return { ok: true, applied: "milestone_paid" };
}

async function transferPayout(admin: SupabaseClient, p: { id: string; pro_id: string; amount_cents: number; payment_id: string | null; job_id: string }) {
  const { data: acct } = await admin.from("seller_accounts").select("stripe_account_id").eq("user_id", p.pro_id).maybeSingle();
  if (!acct?.stripe_account_id || !(await refreshSellerPayouts(admin, p.pro_id).catch(() => false))) return false;
  const { data: pay } = p.payment_id ? await admin.from("market_payments").select("stripe_charge_id, status").eq("id", p.payment_id).maybeSingle() : { data: null };
  if (pay && pay.status !== "paid") return false;
  try {
    const transfer = await getStripe().transfers.create(
      {
        amount: p.amount_cents,
        currency: "usd",
        destination: acct.stripe_account_id as string,
        ...(pay?.stripe_charge_id ? { source_transaction: pay.stripe_charge_id as string } : {}),
        description: "Novelist Writer marketplace",
        metadata: { market_payout_id: p.id, job_id: p.job_id },
      },
      { idempotencyKey: `market-payout-${p.id}` }
    );
    await admin.from("market_payouts").update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: new Date().toISOString(), error: null }).eq("id", p.id);
    return true;
  } catch (e) {
    await admin.from("market_payouts").update({ status: "failed", error: (e instanceof Error ? e.message : "Transfer failed").slice(0, 500) }).eq("id", p.id);
    return false;
  }
}

/** Queue the pro's share of a milestone's payment (less anything refunded) and try to send it now. */
async function payPro(admin: SupabaseClient, job: JobRow, m: MilestoneRow, cents?: number) {
  const { data: pays } = await admin.from("market_payments").select("id, pro_cents, refunded_cents, amount_cents").eq("milestone_id", m.id).eq("status", "paid");
  for (const pay of pays || []) {
    const refundedProShare = Math.round((pay.refunded_cents * pay.pro_cents) / Math.max(1, pay.amount_cents));
    const amount = Math.min(cents ?? Infinity, pay.pro_cents - refundedProShare);
    if (!job.pro_id || amount <= 0) continue;
    const { data } = await admin.from("market_payouts").insert({ job_id: job.id, milestone_id: m.id, payment_id: pay.id, pro_id: job.pro_id, amount_cents: amount }).select("id, pro_id, amount_cents, payment_id, job_id").single();
    if (data) await transferPayout(admin, data as Parameters<typeof transferPayout>[1]);
  }
}

/** Refund the author from a milestone's payment; our share of the refund comes off our revenue. */
async function refundMilestone(admin: SupabaseClient, m: MilestoneRow, cents: number | null, why: string) {
  const { data: pays } = await admin.from("market_payments").select("*").eq("milestone_id", m.id).eq("status", "paid");
  let refunded = 0;
  for (const pay of pays || []) {
    const left = pay.amount_cents - pay.refunded_cents;
    const amount = Math.min(left, cents == null ? left : cents - refunded);
    if (amount < 50 || !pay.stripe_payment_intent) continue;
    const refund = await getStripe().refunds.create(
      { payment_intent: pay.stripe_payment_intent, amount, metadata: { market_payment_id: pay.id, reason: why } },
      { idempotencyKey: `market-refund-${pay.id}-${amount}-${why}` }
    );
    await admin.from("market_payments").update({ refunded_cents: pay.refunded_cents + amount, status: pay.refunded_cents + amount >= pay.amount_cents ? "refunded" : "paid" }).eq("id", pay.id);
    await recordRevenue(admin, { stripeRef: `refund:${refund.id}`, kind: "refund", amountCents: -Math.round((amount * pay.platform_cents) / pay.amount_cents), occurredAt: new Date().toISOString() }).catch(() => null);
    refunded += amount;
  }
  return refunded;
}

/** Approve a delivered milestone: the pro is paid; the last one completes the job. */
export async function approveMilestone(admin: SupabaseClient, job: JobRow, m: MilestoneRow, auto = false) {
  if (!["delivered", "changes", "paid"].includes(m.status)) throw new Error("There's nothing to approve on that milestone.");
  const now = new Date().toISOString();
  await admin.from("market_milestones").update({ status: "approved", approved_at: now, auto_approved: auto }).eq("id", m.id);
  await payPro(admin, job, m);
  const ms = await milestonesOf(admin, job.id);
  const done = ms.every((x) => x.status === "approved" || x.id === m.id);
  if (done) await admin.from("market_jobs").update({ status: "completed", completed_at: now, updated_at: now }).eq("id", job.id);
  const lead = auto ? `"${m.title}" waited ${AUTO_APPROVE_DAYS} days without an answer, so under the agreement it counts as approved.` : `The author approved "${m.title}".`;
  await emailUser(admin, job.pro_id, done ? `"${job.title}" is complete` : `Approved: "${m.title}"`, [lead, `${dollars(m.pro_cents)} is on its way to you through Stripe.`], jobPath(job.id), "Open the job");
  if (auto) await emailUser(admin, job.author_id, `Approved automatically: "${m.title}"`, [lead], jobPath(job.id), "Open the job");
  if (done && !auto) await emailUser(admin, job.author_id, `"${job.title}" is complete`, ["Thanks for hiring through Novelist Writer. Delivered files are kept for 60 days; download what you need."], jobPath(job.id), "Open the job");
}

/**
 * Cancel. Before anything is paid either side can. A paid milestone already delivered is paid to the pro if the author
 * cancels; a paid milestone not yet delivered is refunded when the pro cancels, and needs the pro or a dispute otherwise.
 */
export async function cancelJob(admin: SupabaseClient, job: JobRow, by: "author" | "pro", reason: string) {
  if (["completed", "cancelled", "declined", "not_chosen"].includes(job.status)) throw new Error("This job is already closed.");
  const ms = await milestonesOf(admin, job.id);
  const open = ms.find((m) => ["paid", "delivered", "changes"].includes(m.status));
  if (open && by === "author" && open.status === "paid") {
    throw new Error("This milestone is paid and the work has started. Ask the pro to cancel (you'll be refunded in full), or ask us to step in.");
  }
  if (open && by === "author") {
    await approveMilestone(admin, job, open);
    // That was the last milestone: the job is complete, not cancelled
    if ((await milestonesOf(admin, job.id)).every((m) => m.status === "approved")) return;
  }
  if (open && by === "pro") {
    await refundMilestone(admin, open, null, "pro_cancelled");
    await admin.from("market_milestones").update({ status: "refunded" }).eq("id", open.id);
  }
  const now = new Date().toISOString();
  await admin.from("market_milestones").update({ status: "cancelled" }).eq("job_id", job.id).eq("status", "unpaid");
  await admin.from("market_jobs").update({ status: "cancelled", cancelled_at: now, cancelled_by: by === "author" ? job.author_id : job.pro_id, cancel_reason: reason.slice(0, 500), updated_at: now }).eq("id", job.id);
  const other = by === "author" ? job.pro_id : job.author_id;
  await emailUser(
    admin,
    other,
    `"${job.title}" was cancelled`,
    [
      `The ${by === "author" ? "author" : "pro"} cancelled${reason ? `: “${reason.slice(0, 300)}”` : "."}`,
      open ? (by === "pro" ? "The milestone in progress was refunded to the author in full." : "The delivered milestone was approved and paid to the pro.") : "Nothing had been paid.",
    ],
    jobPath(job.id),
    "Open the job"
  );
}

/** Either side asks us to step in: the job pauses and the admin is told. */
export async function openDispute(admin: SupabaseClient, job: JobRow, by: "author" | "pro", note: string) {
  if (job.status !== "agreed") throw new Error("Only an active job can be disputed.");
  await admin.from("market_jobs").update({ status: "disputed", dispute_note: `${by}: ${note}`.slice(0, 2000), updated_at: new Date().toISOString() }).eq("id", job.id);
  const adminEmail = (process.env.PLATFORM_ADMIN_EMAIL || "ryan.jamison87@gmail.com").trim().toLowerCase();
  const mail = renderEmail({ heading: "Marketplace dispute", paragraphs: [`"${job.title}": the ${by} asked for help.`, note.slice(0, 1000)], button: { label: "Open it", url: appUrl("/admin?tab=marketplace") } });
  await sendEmail({ to: adminEmail, subject: `Marketplace dispute: ${job.title}`, html: mail.html, text: mail.text }).catch(() => null);
  await emailUser(admin, by === "author" ? job.pro_id : job.author_id, `Novelist Writer is looking at "${job.title}"`, ["The other side asked us to step in. We'll read the agreement, the messages, and the deliveries, and be in touch. The job is paused until then."], jobPath(job.id), "Open the job");
}

/** The admin settles a dispute on the open milestone: pay the pro, refund some, or refund it all; then the job resumes or closes. */
export async function resolveDispute(admin: SupabaseClient, jobId: string, outcome: { refundCents: number; close: boolean; note: string }) {
  const { data } = await admin.from("market_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!data || data.status !== "disputed") throw new Error("That job isn't in dispute.");
  const job = data as JobRow;
  const ms = await milestonesOf(admin, job.id);
  const open = ms.find((m) => ["paid", "delivered", "changes"].includes(m.status));
  const now = new Date().toISOString();
  if (open) {
    const total = withFee(open.pro_cents);
    const refund = Math.max(0, Math.min(total, Math.round(outcome.refundCents)));
    if (refund) await refundMilestone(admin, open, refund, "dispute");
    if (refund >= total) await admin.from("market_milestones").update({ status: "refunded" }).eq("id", open.id);
    else {
      await admin.from("market_milestones").update({ status: "approved", approved_at: now }).eq("id", open.id);
      await payPro(admin, job, open);
    }
  }
  if (outcome.close) {
    await admin.from("market_milestones").update({ status: "cancelled" }).eq("job_id", job.id).eq("status", "unpaid");
    await admin.from("market_jobs").update({ status: "cancelled", cancelled_at: now, cancel_reason: `Closed after a dispute. ${outcome.note}`.slice(0, 500), updated_at: now }).eq("id", job.id);
  } else {
    const left = (await milestonesOf(admin, job.id)).some((m) => m.status !== "approved" && m.status !== "refunded" && m.status !== "cancelled");
    await admin.from("market_jobs").update({ status: left ? "agreed" : "completed", ...(left ? {} : { completed_at: now }), updated_at: now }).eq("id", job.id);
  }
  const msg = [`We've looked at "${job.title}". ${outcome.note}`.trim()];
  await emailUser(admin, job.author_id, `About "${job.title}"`, msg, jobPath(job.id), "Open the job");
  await emailUser(admin, job.pro_id, `About "${job.title}"`, msg, jobPath(job.id), "Open the job");
}

/* ---------- Daily ---------- */

/** A delivery the author hasn't answered in 14 days counts as approved. */
export async function autoApproveMarket(admin: SupabaseClient) {
  const cutoff = new Date(Date.now() - AUTO_APPROVE_DAYS * DAY_MS).toISOString();
  const { data, error } = await admin.from("market_milestones").select("*").eq("status", "delivered").lt("delivered_at", cutoff).limit(100);
  if (error || !data?.length) return 0;
  let n = 0;
  for (const m of data as MilestoneRow[]) {
    const { data: job } = await admin.from("market_jobs").select("*").eq("id", m.job_id).maybeSingle();
    if (!job || job.status !== "agreed") continue;
    await approveMilestone(admin, job as JobRow, m, true).catch(() => null);
    n++;
  }
  return n;
}

/** Retry payouts waiting on a pro's payout setup, or that failed. */
export async function payPendingMarketPayouts(admin: SupabaseClient, opts: { timeBudgetMs: number }) {
  const stopAt = Date.now() + opts.timeBudgetMs;
  const { data, error } = await admin.from("market_payouts").select("id, pro_id, amount_cents, payment_id, job_id").in("status", ["pending", "failed"]).limit(100);
  if (error) return 0;
  let n = 0;
  for (const p of data || []) {
    if (Date.now() > stopAt) break;
    if (await transferPayout(admin, p as Parameters<typeof transferPayout>[1])) n++;
  }
  return n;
}

/** Files are kept 60 days after a job closes. */
export async function sweepMarketFiles(admin: SupabaseClient, opts: { timeBudgetMs: number }) {
  if (!r2Configured()) return 0;
  const stopAt = Date.now() + opts.timeBudgetMs;
  const cutoff = new Date(Date.now() - 60 * DAY_MS).toISOString();
  const [{ data: done }, { data: cancelled }] = await Promise.all([
    admin.from("market_jobs").select("id").lt("completed_at", cutoff).limit(50),
    admin.from("market_jobs").select("id").lt("cancelled_at", cutoff).limit(50),
  ]);
  const ids = [...(done || []), ...(cancelled || [])].map((j) => j.id as string);
  if (!ids.length) return 0;
  const { data: files } = await admin.from("market_files").select("id, r2_key").in("job_id", ids).is("deleted_at", null).limit(500);
  let n = 0;
  for (const f of files || []) {
    if (Date.now() > stopAt) break;
    await deleteObject(f.r2_key as string).catch(() => null);
    await admin.from("market_files").update({ deleted_at: new Date().toISOString() }).eq("id", f.id);
    n++;
  }
  return n;
}

/* ---------- Webhook helpers ---------- */

export async function isMarketPayment(admin: SupabaseClient, paymentIntentId: string | null | undefined) {
  if (!paymentIntentId) return false;
  const { data } = await admin.from("market_payments").select("id").eq("stripe_payment_intent", paymentIntentId).limit(1);
  return Boolean(data?.length);
}

/** A card dispute on a milestone payment: hold anything not yet sent to the pro and pause the job. */
export async function disputeMarketCharge(admin: SupabaseClient, chargeId: string) {
  const { data: pay } = await admin.from("market_payments").select("id, job_id").eq("stripe_charge_id", chargeId).maybeSingle();
  if (!pay) return false;
  await admin.from("market_payments").update({ status: "disputed" }).eq("id", pay.id);
  await admin.from("market_payouts").update({ status: "cancelled", error: "Payment disputed" }).eq("payment_id", pay.id).in("status", ["pending", "failed"]);
  await admin.from("market_jobs").update({ status: "disputed", dispute_note: "The author's bank disputed a payment.", updated_at: new Date().toISOString() }).eq("id", pay.job_id).eq("status", "agreed");
  return true;
}

/* ---------- The job page ---------- */

/** Everything the job page shows, for the author or the pro. */
export async function jobView(admin: SupabaseClient, job: JobRow, role: "author" | "pro") {
  const [ms, { data: files }, { data: messages }, author, pro, { data: book }, { data: payouts }] = await Promise.all([
    milestonesOf(admin, job.id),
    admin.from("market_files").select("*").eq("job_id", job.id).is("deleted_at", null).order("created_at"),
    admin.from("market_messages").select("*").eq("job_id", job.id).order("created_at").limit(500),
    nameOf(admin, job.author_id),
    nameOf(admin, job.pro_id),
    job.project_id ? admin.from("projects").select("title").eq("id", job.project_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("market_payouts").select("milestone_id, amount_cents, status").eq("job_id", job.id),
  ]);
  const t = marketType(job.market_type);
  const quote: Quote | null = job.quote_version ? normalizeQuote(job.quote, job.market_type) : null;
  const { data: review } = job.status === "completed" ? await admin.from("market_reviews").select("stars, body, reply, created_at").eq("job_id", job.id).maybeSingle() : { data: null };
  return {
    id: job.id,
    role,
    hasBook: Boolean(job.project_id),
    review: review ? { stars: review.stars as number, body: (review.body as string) || "", reply: (review.reply as string | null) || null } : null,
    title: job.title,
    brief: job.brief,
    deadline: job.deadline,
    budgetNote: job.budget_note,
    type: { id: job.market_type, label: t?.label || job.market_type, group: t?.group || "editing" },
    status: job.status,
    source: job.source,
    book: (book?.title as string) || null,
    authorName: author || "The author",
    proName: pro || (job.invite_email && role === "author" ? job.invite_email : "The pro"),
    invitePending: Boolean(job.invite_token && !job.pro_id),
    quote,
    quoteVersion: job.quote_version,
    agreement: job.agreement_text,
    agreedAt: job.agreed_at,
    disputeNote: job.status === "disputed" ? job.dispute_note : null,
    cancelReason: job.cancel_reason,
    feePct: MARKET_FEE_PCT,
    payableId: job.status === "agreed" ? payableMilestone(ms)?.id || null : null,
    milestones: ms.map((m) => ({
      id: m.id,
      title: m.title,
      proCents: m.pro_cents,
      totalCents: withFee(m.pro_cents),
      dueOn: m.due_on,
      status: m.status,
      revisionsUsed: m.revisions_used,
      deliveryNote: m.delivery_note,
      deliveredAt: m.delivered_at,
      autoApproveOn: m.status === "delivered" && m.delivered_at ? new Date(Date.parse(m.delivered_at) + AUTO_APPROVE_DAYS * DAY_MS).toISOString().slice(0, 10) : null,
      paidOutCents: (payouts || []).filter((p) => p.milestone_id === m.id && p.status === "paid").reduce((n, p) => n + p.amount_cents, 0),
    })),
    files: await Promise.all(
      (files || []).map(async (f) => ({
        id: f.id as string,
        milestoneId: (f.milestone_id as string | null) || null,
        kind: f.kind as string,
        name: f.name as string,
        bytes: Number(f.bytes) || 0,
        mine: f.uploader_id === (role === "author" ? job.author_id : job.pro_id),
        url: await signedDownloadUrl(f.r2_key as string, 2 * 3600, f.name as string).catch(() => null),
      }))
    ),
    messages: (messages || []).map((m) => ({ id: m.id as string, mine: m.sender_id === (role === "author" ? job.author_id : job.pro_id), body: m.body as string, at: m.created_at as string })),
  };
}
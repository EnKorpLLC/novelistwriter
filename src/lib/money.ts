import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, appUrl } from "@/lib/stripe";
import { renderEmail, sendEmail } from "@/lib/email";
import { platformAdminEmail } from "@/lib/platform-admin";

export type RevenueKind = "subscription" | "credits" | "project_unlock" | "other" | "refund" | "sales_fee";

/** Stripe's standard US card fee, used to estimate fees per payment. */
const STRIPE_PCT = 0.029;
const STRIPE_FIXED_CENTS = 30;
const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Free-plan limits, overridable with env vars when a plan changes. */
export function freeLimits() {
  return {
    dbBytes: Number(process.env.SUPABASE_DB_LIMIT_MB || 500) * MB,
    storageBytes: Number(process.env.SUPABASE_STORAGE_LIMIT_MB || 1024) * MB,
    egressBytes: Number(process.env.SUPABASE_EGRESS_LIMIT_GB || 5) * GB,
    emailsPerDay: Number(process.env.EMAIL_DAILY_CAP || 500),
  };
}

/** Paid upgrades the Money tab checks against the 2x self-funding rule. */
export const PLANNED_UPGRADES = [
  { id: "vercel_pro", label: "Vercel Pro", monthlyCents: 2000 },
  { id: "supabase_pro", label: "Supabase Pro", monthlyCents: 2500 },
  { id: "paid_email", label: "Paid email sending", monthlyCents: 2000 },
] as const;

export async function getSetting<T>(admin: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data, error } = await admin.from("admin_settings").select("value").eq("key", key).maybeSingle();
  if (error || !data) return fallback;
  return (data.value as T) ?? fallback;
}

export async function setSetting(admin: SupabaseClient, key: string, value: unknown) {
  await admin
    .from("admin_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** Record one payment or refund. Safe to call twice for the same Stripe object. */
export async function recordRevenue(
  admin: SupabaseClient,
  row: {
    stripeRef: string;
    kind: RevenueKind;
    amountCents: number;
    occurredAt: string;
    userId?: string | null;
    tier?: string | null;
    interval?: string | null;
    currency?: string | null;
  }
) {
  try {
    const { error } = await admin.from("revenue_events").upsert(
      {
        stripe_ref: row.stripeRef,
        kind: row.kind,
        amount_cents: Math.round(row.amountCents),
        occurred_at: row.occurredAt,
        user_id: row.userId || null,
        tier: row.tier || null,
        billing_interval: row.interval || null,
        currency: (row.currency || "usd").toLowerCase(),
      },
      { onConflict: "stripe_ref", ignoreDuplicates: true }
    );
    if (error) return;
    if (row.amountCents > 0) await maybeNotifyFirstSale(admin);
  } catch {
    // Before migration_money.sql the table doesn't exist; money tracking never blocks payments
  }
}

/** The day real money first arrives, remind the owner to move hosting to Vercel Pro (its terms require it). */
async function maybeNotifyFirstSale(admin: SupabaseClient) {
  const flags = await getSetting<{ notifiedAt?: string }>(admin, "first_sale", {});
  if (flags.notifiedAt) return;
  await setSetting(admin, "first_sale", { notifiedAt: new Date().toISOString() });
  const mail = renderEmail({
    heading: "First sale! Upgrade Vercel to Pro today",
    paragraphs: [
      "Novelist Writer just recorded its first real payment. Congratulations.",
      "Vercel's free Hobby plan doesn't allow sites that take payments, so upgrade the project to Vercel Pro ($20/month) today. Nothing in the app needs to change.",
      "When it's done, mark it in the admin Money tab to clear the reminder.",
    ],
    button: { label: "Open the Money tab", url: appUrl("/admin?tab=money") },
  });
  await sendEmail({
    to: platformAdminEmail(),
    subject: "First sale! Upgrade Vercel to Pro today",
    text: mail.text,
    html: mail.html,
  });
}

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

type SubInfo = { userId: string | null; tier: string | null; interval: string | null };

function subInfo(sub: Stripe.Subscription | null): SubInfo {
  if (!sub) return { userId: null, tier: null, interval: null };
  const price = sub.items?.data?.[0]?.price;
  return {
    userId: sub.metadata?.supabase_user_id || null,
    tier: sub.metadata?.tier || null,
    interval: price?.recurring?.interval || null,
  };
}

/** A paid subscription invoice (first payment or renewal). */
export async function recordInvoice(admin: SupabaseClient, invoice: Stripe.Invoice, sub: Stripe.Subscription | null) {
  const paid = invoice.amount_paid ?? 0;
  if (paid <= 0) return;
  const info = subInfo(sub);
  await recordRevenue(admin, {
    stripeRef: `invoice:${invoice.id}`,
    kind: "subscription",
    amountCents: paid,
    currency: invoice.currency,
    occurredAt: iso(invoice.status_transitions?.paid_at || invoice.created),
    ...info,
  });
}

/** A one-time Checkout payment: credit packs and project unlocks. Subscriptions are recorded from invoices. */
export async function recordCheckout(admin: SupabaseClient, session: Stripe.Checkout.Session, userId: string | null) {
  if (session.mode !== "payment" || session.payment_status !== "paid") return;
  const kind = session.metadata?.kind;
  // Book sales are mostly the author's money; only our fee is recorded, as sales_fee
  if (kind === "book_purchase") return;
  await recordRevenue(admin, {
    stripeRef: `checkout:${session.id}`,
    kind: kind === "project_unlock" ? "project_unlock" : kind === "credits" || !kind ? "credits" : "other",
    amountCents: session.amount_total ?? 0,
    currency: session.currency,
    occurredAt: iso(session.created),
    userId,
  });
}

export async function recordRefund(admin: SupabaseClient, refund: Stripe.Refund) {
  if (refund.status && refund.status !== "succeeded") return;
  const pi = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
  if (pi) {
    const { data: book } = await admin.from("book_purchases").select("id").eq("stripe_payment_intent", pi).maybeSingle();
    if (book) return;
  }
  await recordRevenue(admin, {
    stripeRef: `refund:${refund.id}`,
    kind: "refund",
    amountCents: -(refund.amount ?? 0),
    currency: refund.currency,
    occurredAt: iso(refund.created),
  });
}

/** Monthly recurring revenue from active Stripe subscriptions (yearly plans counted as 1/12 a month). */
export async function snapshotMrr(admin: SupabaseClient) {
  const stripe = getStripe();
  const subs = await stripe.subscriptions.list({ status: "active", limit: 100 }).autoPagingToArray({ limit: 5000 });
  let cents = 0;
  const byTier: Record<string, number> = {};
  for (const s of subs) {
    for (const item of s.items.data) {
      const p = item.price;
      const unit = (p.unit_amount ?? 0) * (item.quantity ?? 1);
      const every = p.recurring?.interval_count || 1;
      const perMonth =
        p.recurring?.interval === "year"
          ? unit / (12 * every)
          : p.recurring?.interval === "week"
            ? (unit * 52) / (12 * every)
            : p.recurring?.interval === "day"
              ? (unit * 365) / (12 * every)
              : unit / every;
      cents += perMonth;
    }
    const tier = s.metadata?.tier || "unknown";
    byTier[tier] = (byTier[tier] || 0) + 1;
  }
  const snap = { cents: Math.round(cents), subscribers: subs.length, byTier, at: new Date().toISOString() };
  await setSetting(admin, "mrr", snap);
  return snap;
}

/** Pull past payments and refunds from Stripe (safe to repeat), then refresh the MRR snapshot. */
export async function syncFromStripe(admin: SupabaseClient) {
  const stripe = getStripe();
  const subCache = new Map<string, Stripe.Subscription | null>();
  const getSub = async (id: string | null) => {
    if (!id) return null;
    if (!subCache.has(id)) subCache.set(id, await stripe.subscriptions.retrieve(id).catch(() => null));
    return subCache.get(id) || null;
  };

  let invoices = 0;
  let checkouts = 0;
  let refunds = 0;
  for (const inv of await stripe.invoices.list({ status: "paid", limit: 100 }).autoPagingToArray({ limit: 5000 })) {
    if ((inv.amount_paid ?? 0) <= 0) continue;
    const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id || null;
    await recordInvoice(admin, inv, await getSub(subId));
    invoices++;
  }
  for (const s of await stripe.checkout.sessions.list({ status: "complete", limit: 100 }).autoPagingToArray({ limit: 5000 })) {
    if (s.mode !== "payment") continue;
    await recordCheckout(admin, s, s.metadata?.supabase_user_id || null);
    checkouts++;
  }
  for (const r of await stripe.refunds.list({ limit: 100 }).autoPagingToArray({ limit: 5000 })) {
    await recordRefund(admin, r);
    refunds++;
  }
  const mrr = await snapshotMrr(admin);
  await setSetting(admin, "last_sync", { at: new Date().toISOString(), invoices, checkouts, refunds });
  return { invoices, checkouts, refunds, mrr };
}

type CostRow = { id: string; service: string; amount_cents: number; cadence: string; started_on: string; ended_on: string | null; notes: string };

function monthKey(d: Date) {
  return d.toISOString().slice(0, 7);
}

/** What a bill costs in a given month: monthly in full, yearly spread over 12, one-time in its month. */
function costInMonth(c: CostRow, month: string): number {
  const start = c.started_on.slice(0, 7);
  const end = c.ended_on ? c.ended_on.slice(0, 7) : null;
  if (month < start || (end && month > end)) return 0;
  if (c.cadence === "monthly") return c.amount_cents;
  if (c.cadence === "yearly") return c.amount_cents / 12;
  return month === start ? c.amount_cents : 0;
}

export async function usageNow(admin: SupabaseClient) {
  const limits = freeLimits();
  const startOfDay = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const [db, storage, emails, egress] = await Promise.all([
    admin.rpc("admin_db_size"),
    admin.rpc("admin_storage_size"),
    admin.from("email_sends").select("id", { count: "exact", head: true }).gte("sent_at", startOfDay),
    getSetting<{ gb?: number; at?: string }>(admin, "supabase_egress", {}),
  ]);
  const item = (label: string, used: number | null, limit: number, unit: "bytes" | "count", note?: string) => ({
    label,
    used,
    limit,
    unit,
    pct: used == null ? null : used / limit,
    note: note || null,
  });
  return [
    item("Database", db.error ? null : Number(db.data), limits.dbBytes, "bytes"),
    item("File storage", storage.error ? null : Number(storage.data), limits.storageBytes, "bytes"),
    item(
      "Supabase downloads this month",
      egress.gb == null ? null : egress.gb * GB,
      limits.egressBytes,
      "bytes",
      egress.at ? `Entered ${egress.at.slice(0, 10)} from the Supabase dashboard` : "Enter it from the Supabase dashboard (Usage)"
    ),
    item("Emails sent today", emails.error ? null : emails.count || 0, limits.emailsPerDay, "count", "Gmail's daily limit"),
  ];
}

/** Book sales across all authors: what readers paid, tax collected for states, our fees, and what authors are owed. */
async function directSalesTotals(admin: SupabaseClient) {
  const { data, error } = await admin.from("book_purchases").select("price_cents, tax_cents, platform_fee_cents, author_cents, status, payout_id").limit(50000);
  if (error) return null;
  const rows = data || [];
  const paid = rows.filter((r) => r.status === "paid");
  return {
    sales: paid.length,
    grossCents: paid.reduce((n, r) => n + r.price_cents, 0),
    taxCents: paid.reduce((n, r) => n + r.tax_cents, 0),
    feeCents: rows.reduce((n, r) => n + r.platform_fee_cents, 0),
    owedCents: rows.filter((r) => !r.payout_id).reduce((n, r) => n + r.author_cents, 0),
  };
}

/** Whether Stripe Tax is set up on our account, so sales tax is calculated at checkout. */
async function stripeTaxStatus(): Promise<"active" | "pending" | "unknown"> {
  try {
    const settings = await getStripe().tax.settings.retrieve();
    return settings.status === "active" ? "active" : "pending";
  } catch {
    return "unknown";
  }
}

export async function moneySummary(admin: SupabaseClient) {
  const now = new Date();
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  const since = `${months[0]}-01T00:00:00.000Z`;

  const [{ data: events, error: evErr }, { data: costs, error: costErr }, { data: jobs }, aiCost, mrr, firstSale, lastSync] =
    await Promise.all([
      admin.from("revenue_events").select("kind, amount_cents, occurred_at, tier").gte("occurred_at", since).limit(50000),
      admin.from("admin_costs").select("*").order("created_at", { ascending: true }),
      admin.from("ai_jobs").select("credit_cost, created_at").gte("created_at", since).eq("status", "complete").limit(50000),
      getSetting<{ usdPerCredit?: number }>(admin, "ai_cost", {}),
      getSetting<{ cents?: number; subscribers?: number; byTier?: Record<string, number>; at?: string }>(admin, "mrr", {}),
      getSetting<{ notifiedAt?: string; vercelUpgradedAt?: string }>(admin, "first_sale", {}),
      getSetting<{ at?: string; invoices?: number; checkouts?: number; refunds?: number }>(admin, "last_sync", {}),
    ]);
  if (evErr || costErr) return { migrationNeeded: true as const };

  const perCredit = Number(aiCost.usdPerCredit) || 0;
  const rows = months.map((m) => ({
    month: m,
    subscriptions: 0,
    oneTime: 0,
    refunds: 0,
    stripeFees: 0,
    bills: 0,
    ai: 0,
    gross: 0,
    net: 0,
  }));
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  for (const e of events || []) {
    const r = byMonth.get(String(e.occurred_at).slice(0, 7));
    if (!r) continue;
    const cents = Number(e.amount_cents) || 0;
    if (e.kind === "refund") r.refunds += cents;
    else if (e.kind === "subscription") r.subscriptions += cents;
    else r.oneTime += cents;
    // Stripe's fee on a book sale comes out of the author's share, not ours
    if (cents > 0 && e.kind !== "sales_fee") r.stripeFees += cents * STRIPE_PCT + STRIPE_FIXED_CENTS;
  }
  for (const j of jobs || []) {
    const r = byMonth.get(String(j.created_at).slice(0, 7));
    if (r) r.ai += (Number(j.credit_cost) || 0) * perCredit * 100;
  }
  for (const r of rows) {
    r.bills = (costs || []).reduce((sum, c) => sum + costInMonth(c as CostRow, r.month), 0);
    r.gross = r.subscriptions + r.oneTime + r.refunds;
    r.net = r.gross - r.stripeFees - r.bills - r.ai;
  }

  const current = rows[rows.length - 1];
  const monthlyCosts = (costs || []).reduce((sum, c) => sum + costInMonth(c as CostRow, current.month), 0);
  const mrrCents = Number(mrr.cents) || 0;
  const subscribers = Number(mrr.subscribers) || 0;
  const perSubscriber = subscribers ? mrrCents / subscribers : 1900;
  const outgoing = monthlyCosts + current.ai;
  const breakEvenSubscribers = Math.ceil(outgoing / Math.max(1, perSubscriber * (1 - STRIPE_PCT) - STRIPE_FIXED_CENTS));
  const incomeForRule = Math.max(mrrCents, current.gross);
  const upgrades = PLANNED_UPGRADES.map((u) => {
    const after = monthlyCosts + current.ai + u.monthlyCents;
    return { ...u, ratio: after ? incomeForRule / after : null, affordable: incomeForRule >= 2 * after };
  });

  const [sales, stripeTax] = await Promise.all([directSalesTotals(admin), stripeTaxStatus()]);

  return {
    migrationNeeded: false as const,
    sales,
    stripeTax,
    months: rows.map((r) => ({
      ...r,
      stripeFees: Math.round(r.stripeFees),
      bills: Math.round(r.bills),
      ai: Math.round(r.ai),
      net: Math.round(r.net),
    })),
    mrr: { cents: mrrCents, subscribers, byTier: mrr.byTier || {}, at: mrr.at || null },
    monthlyCosts: Math.round(monthlyCosts),
    aiCostPerCredit: perCredit,
    breakEvenSubscribers,
    upgrades,
    firstSale: {
      happened: Boolean(firstSale.notifiedAt) || (events || []).some((e) => Number(e.amount_cents) > 0),
      vercelUpgraded: Boolean(firstSale.vercelUpgradedAt),
    },
    lastSync,
    costs: costs || [],
  };
}

/** Called from the daily cron: email the owner once a day if any free-tier alarm is red. */
export async function emailRedAlarms(admin: SupabaseClient) {
  try {
    const usage = await usageNow(admin);
    const red = usage.filter((u) => u.pct != null && u.pct >= 0.95);
    if (!red.length) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const last = await getSetting<{ day?: string }>(admin, "alarm_email", {});
    if (last.day === today) return 0;
    await setSetting(admin, "alarm_email", { day: today });
    const mail = renderEmail({
      heading: "A free plan is almost full",
      paragraphs: red.map((u) => `${u.label}: ${Math.round((u.pct || 0) * 100)}% of the free limit.`),
      button: { label: "Open the Money tab", url: appUrl("/admin?tab=money") },
    });
    await sendEmail({ to: platformAdminEmail(), subject: "Novelist Writer: a free plan is almost full", text: mail.text, html: mail.html });
    return red.length;
  } catch {
    return 0;
  }
}

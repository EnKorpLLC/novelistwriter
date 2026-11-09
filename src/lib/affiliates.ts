import "server-only";
import { createHash } from "crypto";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, appUrl } from "@/lib/stripe";
import { notifyUser } from "@/lib/notifications";

export const AFFILIATE_RATE = 0.3;
export const AFFILIATE_WINDOW_DAYS = 365;
export const AFFILIATE_HOLD_DAYS = 60;
export const AFFILIATE_MIN_PAYOUT_CENTS = 2500;
export const AFFILIATES_MIGRATION_HINT = "Database needs an update. Run supabase/migration_affiliates.sql in the Supabase SQL editor.";

const DAY_MS = 86_400_000;

/** Countries Stripe can pay affiliates in from a US platform (US accounts directly, others as payout recipients). */
export const PAYOUT_COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "PT", name: "Portugal" },
  { code: "SE", name: "Sweden" },
  { code: "DK", name: "Denmark" },
  { code: "NO", name: "Norway" },
  { code: "FI", name: "Finland" },
  { code: "CH", name: "Switzerland" },
  { code: "SG", name: "Singapore" },
];

export function isMissingAffiliateTable(message: string | undefined) {
  return /affiliate|schema cache|does not exist/i.test(String(message || ""));
}

export function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Credit 30% of a paid subscription invoice to the customer's referrer, within 12 months of their first paid invoice. */
export async function recordCommissionForInvoice(admin: SupabaseClient, invoice: Stripe.Invoice, customerUserId: string) {
  const paid = invoice.amount_paid ?? 0;
  if (paid <= 0) return;
  const { data: customer } = await admin.from("profiles").select("referred_by").eq("id", customerUserId).maybeSingle();
  const affiliateId = customer?.referred_by as string | null;
  if (!affiliateId || affiliateId === customerUserId) return;
  const { data: affiliate } = await admin.from("affiliates").select("status").eq("user_id", affiliateId).maybeSingle();
  if (affiliate?.status !== "approved") return;

  const paidAt = (invoice.status_transitions?.paid_at || invoice.created) * 1000;
  const { data: first } = await admin
    .from("affiliate_commissions")
    .select("created_at")
    .eq("affiliate_user_id", affiliateId)
    .eq("customer_user_id", customerUserId)
    .gt("amount_cents", 0)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (first && paidAt > Date.parse(first.created_at) + AFFILIATE_WINDOW_DAYS * DAY_MS) return;

  const basis = Math.max(0, paid - (invoice.tax ?? 0));
  const amount = Math.floor(basis * AFFILIATE_RATE);
  if (amount <= 0) return;
  const chargeId = typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id || null;
  const { error } = await admin.from("affiliate_commissions").insert({
    affiliate_user_id: affiliateId,
    customer_user_id: customerUserId,
    stripe_invoice_id: invoice.id,
    stripe_charge_id: chargeId,
    basis_cents: basis,
    amount_cents: amount,
    currency: invoice.currency || "usd",
    available_at: new Date(paidAt + AFFILIATE_HOLD_DAYS * DAY_MS).toISOString(),
  });
  // A replayed webhook hits the unique invoice index; that's fine
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
}

/**
 * A refund or dispute shrinks the commission to match what the customer actually paid.
 * Unpaid commissions are reduced in place; paid ones get a negative row that comes out of the next payout.
 */
export async function adjustForCharge(admin: SupabaseClient, chargeId: string, refundedFraction: number, reason: string) {
  const { data: rows } = await admin.from("affiliate_commissions").select("*").eq("stripe_charge_id", chargeId).neq("status", "reversed");
  const original = (rows || []).find((r) => r.amount_cents > 0);
  if (!original) return;
  const target = Math.floor(original.basis_cents * Math.max(0, 1 - Math.min(1, refundedFraction)) * AFFILIATE_RATE);
  const current = (rows || []).reduce((n, r) => n + r.amount_cents, 0);
  const delta = target - current;
  if (delta >= 0) return;
  if (original.status === "pending") {
    const next = original.amount_cents + delta;
    await admin
      .from("affiliate_commissions")
      .update(next <= 0 ? { status: "reversed", note: reason } : { amount_cents: next, note: reason })
      .eq("id", original.id);
    return;
  }
  await admin.from("affiliate_commissions").insert({
    affiliate_user_id: original.affiliate_user_id,
    customer_user_id: original.customer_user_id,
    stripe_charge_id: chargeId,
    basis_cents: 0,
    amount_cents: delta,
    currency: original.currency,
    available_at: new Date().toISOString(),
    note: reason,
  });
}

/** Start or resume Stripe's hosted onboarding for an affiliate's payout account. */
export async function connectOnboardingUrl(admin: SupabaseClient, userId: string, country: string, email: string | null) {
  const stripe = getStripe();
  const { data: aff } = await admin.from("affiliates").select("stripe_account_id, status").eq("user_id", userId).maybeSingle();
  if (aff?.status !== "approved") throw new Error("Your affiliate application hasn't been approved yet.");
  let accountId = aff.stripe_account_id as string | null;
  if (!accountId) {
    const code = PAYOUT_COUNTRIES.some((c) => c.code === country) ? country : "US";
    const account = await stripe.accounts.create({
      type: "express",
      country: code,
      email: email || undefined,
      capabilities: { transfers: { requested: true } },
      ...(code === "US" ? {} : { tos_acceptance: { service_agreement: "recipient" } }),
      business_profile: { product_description: "Referral commissions from the Novelist Writer affiliate program", url: appUrl("/affiliates") },
      metadata: { supabase_user_id: userId },
    });
    accountId = account.id;
    await admin.from("affiliates").update({ stripe_account_id: accountId, country: code }).eq("user_id", userId);
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: appUrl("/dashboard/affiliate?connect=refresh"),
    return_url: appUrl("/dashboard/affiliate?connect=done"),
    type: "account_onboarding",
  });
  return link.url;
}

/** Whether Stripe can pay this affiliate yet; saved so payouts and the dashboard agree. */
export async function refreshPayoutStatus(admin: SupabaseClient, userId: string, accountId: string) {
  const account = await getStripe().accounts.retrieve(accountId);
  const enabled = Boolean(account.payouts_enabled && account.capabilities?.transfers === "active");
  await admin.from("affiliates").update({ payouts_enabled: enabled }).eq("user_id", userId);
  return { enabled, detailsSubmitted: Boolean(account.details_submitted) };
}

export type PayoutRun = { paid: number; paidCents: number; failed: number; skipped: number; errors: string[] };

/** Pays every approved affiliate whose released commissions add up to at least $25. Safe to run more than once. */
export async function runAffiliatePayouts(admin: SupabaseClient, opts: { timeBudgetMs?: number } = {}): Promise<PayoutRun> {
  const stopAt = Date.now() + (opts.timeBudgetMs ?? 25_000);
  const out: PayoutRun = { paid: 0, paidCents: 0, failed: 0, skipped: 0, errors: [] };
  const { data: affiliates, error } = await admin.from("affiliates").select("user_id, stripe_account_id").eq("status", "approved").not("stripe_account_id", "is", null);
  if (error) return out;
  const stripe = getStripe();
  const now = new Date().toISOString();

  for (const a of affiliates || []) {
    if (Date.now() > stopAt) break;
    const { data: ready } = await admin.from("affiliate_commissions").select("id, amount_cents").eq("affiliate_user_id", a.user_id).eq("status", "pending").lte("available_at", now);
    const total = (ready || []).reduce((n, r) => n + r.amount_cents, 0);
    if (!ready?.length || total < AFFILIATE_MIN_PAYOUT_CENTS) {
      out.skipped += 1;
      continue;
    }
    const status = await refreshPayoutStatus(admin, a.user_id, a.stripe_account_id).catch(() => ({ enabled: false }));
    if (!status.enabled) {
      out.skipped += 1;
      continue;
    }
    const ids = ready.map((r) => r.id).sort();
    // The same set of commissions always makes the same transfer, so a retry can't pay twice
    const key = `aff-${createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 40)}`;
    try {
      const transfer = await stripe.transfers.create(
        { amount: total, currency: "usd", destination: a.stripe_account_id, description: "Novelist Writer affiliate commissions", metadata: { affiliate_user_id: a.user_id, commissions: String(ids.length) } },
        { idempotencyKey: key }
      );
      const { data: payout } = await admin.from("affiliate_payouts").insert({ affiliate_user_id: a.user_id, amount_cents: total, stripe_transfer_id: transfer.id }).select("id").single();
      await admin.from("affiliate_commissions").update({ status: "paid", payout_id: payout?.id || null }).in("id", ids);
      await notifyUser(admin, a.user_id, {
        type: "affiliate",
        title: `${money(total)} in affiliate commissions is on its way`,
        body: "Stripe sends it to your bank on your payout schedule, usually within a few days.",
        href: "/dashboard/affiliate",
      });
      out.paid += 1;
      out.paidCents += total;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transfer failed";
      await admin.from("affiliate_payouts").insert({ affiliate_user_id: a.user_id, amount_cents: total, status: "failed", error: message.slice(0, 500) });
      out.failed += 1;
      out.errors.push(message);
    }
  }
  return out;
}

export type AffiliateSummary = {
  signups: number;
  payingCustomers: number;
  onHoldCents: number;
  readyCents: number;
  paidCents: number;
  recent: { createdAt: string; amountCents: number; status: string; availableAt: string; note: string }[];
  payouts: { createdAt: string; amountCents: number; status: string }[];
};

export async function affiliateSummary(admin: SupabaseClient, userId: string): Promise<AffiliateSummary> {
  const now = Date.now();
  const [{ count: signups }, { data: commissions }, { data: payouts }] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", userId),
    admin.from("affiliate_commissions").select("customer_user_id, amount_cents, status, available_at, created_at, note").eq("affiliate_user_id", userId).order("created_at", { ascending: false }).limit(1000),
    admin.from("affiliate_payouts").select("amount_cents, status, created_at").eq("affiliate_user_id", userId).order("created_at", { ascending: false }).limit(24),
  ]);
  const rows = commissions || [];
  const pending = rows.filter((r) => r.status === "pending");
  return {
    signups: signups || 0,
    payingCustomers: new Set(rows.filter((r) => r.amount_cents > 0 && r.status !== "reversed").map((r) => r.customer_user_id)).size,
    onHoldCents: pending.filter((r) => Date.parse(r.available_at) > now).reduce((n, r) => n + r.amount_cents, 0),
    readyCents: pending.filter((r) => Date.parse(r.available_at) <= now).reduce((n, r) => n + r.amount_cents, 0),
    paidCents: rows.filter((r) => r.status === "paid").reduce((n, r) => n + r.amount_cents, 0),
    recent: rows.slice(0, 20).map((r) => ({ createdAt: r.created_at, amountCents: r.amount_cents, status: r.status, availableAt: r.available_at, note: r.note })),
    payouts: (payouts || []).map((p) => ({ createdAt: p.created_at, amountCents: p.amount_cents, status: p.status })),
  };
}

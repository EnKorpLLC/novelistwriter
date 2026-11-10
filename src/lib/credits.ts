import { createServiceClient } from "@/lib/supabase/admin";
import type { CreditBalance, JobType } from "@/lib/types";
import { CREDIT_COSTS } from "@/lib/types";

export function creditCost(jobType: JobType): number {
  return CREDIT_COSTS[jobType];
}

export async function getCreditBalance(userId: string): Promise<CreditBalance | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("credit_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data as CreditBalance | null;
}

/** True for a credit_balances row on paid Studio, Lifetime Studio, or a running pass (select "*" so it works before later migrations). */
export function rowHasStudio(row: { subscription_tier?: string | null; pass_active_until?: string | null; lifetime_tier?: string | null } | null) {
  if (!row) return false;
  return row.subscription_tier === "studio" || row.lifetime_tier === "studio" || Boolean(row.pass_active_until && Date.parse(row.pass_active_until) > Date.now());
}

/** Days an author site and launch pages stay public after Pro, Studio, or a Studio pass ends. */
export const SITE_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type TierRow = {
  subscription_tier?: string | null;
  pass_active_until?: string | null;
  site_grace_until?: string | null;
  lifetime_tier?: string | null;
} | null;

/** Pro and up: paid Pro or Studio, a lifetime plan, or a running Studio pass. */
export function rowHasPro(row: TierRow) {
  if (!row) return false;
  return row.subscription_tier === "pro" || row.lifetime_tier === "pro" || rowHasStudio(row);
}

/**
 * Author site and launch pages are public on Pro and up, and for SITE_GRACE_DAYS after a paid plan
 * (site_grace_until, set when the subscription ends) or a Studio pass runs out.
 */
export function rowSitePublic(row: TierRow, now = Date.now()) {
  if (rowHasPro(row)) return true;
  if (!row) return false;
  if (row.site_grace_until && Date.parse(row.site_grace_until) > now) return true;
  const passEnd = row.pass_active_until ? Date.parse(row.pass_active_until) : NaN;
  return Number.isFinite(passEnd) && passEnd + SITE_GRACE_DAYS * DAY_MS > now;
}

/** Pro and up: paid Pro, paid Studio, or a running Studio pass. */
export async function userHasPro(userId: string): Promise<boolean> {
  return rowHasPro((await getCreditBalance(userId)) as TierRow);
}

export async function authorSitePublic(userId: string): Promise<boolean> {
  return rowSitePublic((await getCreditBalance(userId)) as TierRow);
}

/** Of these authors, the ones whose site and launch pages are public. */
export async function authorsWithPublicSites(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Set();
  const { data } = await createServiceClient().from("credit_balances").select("*").in("user_id", ids);
  return new Set((data || []).filter((r) => rowSitePublic(r)).map((r) => r.user_id as string));
}

function passRunning(bal: CreditBalance | null): boolean {
  const until = (bal as (CreditBalance & { pass_active_until?: string | null }) | null)?.pass_active_until;
  return Boolean(until && Date.parse(until) > Date.now());
}

/**
 * Studio's reader tools (beta, ARC, audience, catalog): a paid Studio subscription or a
 * running Studio pass. AI credits, BYOK, and priority AI check the subscription tier directly.
 */
export async function userHasStudio(userId: string): Promise<boolean> {
  return rowHasStudio((await getCreditBalance(userId)) as TierRow);
}

/** Debit credits: monthly allowance first, then purchased balance, then free taste for cheap jobs */
export async function debitCredits(opts: {
  userId: string;
  jobType: JobType;
  cost?: number;
}): Promise<{ ok: true; charged: number } | { ok: false; error: string; cost: number }> {
  const admin = createServiceClient();
  const cost = opts.cost ?? creditCost(opts.jobType);
  const { data: bal } = await admin
    .from("credit_balances")
    .select("*")
    .eq("user_id", opts.userId)
    .single();

  if (!bal) {
    return { ok: false, error: "No credit account", cost };
  }

  let remaining = cost;
  let monthly = bal.monthly_allowance_remaining as number;
  let balance = bal.balance as number;
  let taste = bal.free_ai_taste_remaining as number;

  if (monthly >= remaining) {
    monthly -= remaining;
    remaining = 0;
  } else {
    remaining -= monthly;
    monthly = 0;
  }

  if (remaining > 0 && balance >= remaining) {
    balance -= remaining;
    remaining = 0;
  } else if (remaining > 0) {
    remaining -= balance;
    balance = 0;
  }

  if (remaining > 0 && taste > 0 && cost <= 2) {
    taste -= 1;
    remaining = 0;
  }

  if (remaining > 0) {
    return {
      ok: false,
      error: `Need ${cost} credits. Buy a pack or subscribe.`,
      cost,
    };
  }

  const { error } = await admin
    .from("credit_balances")
    .update({
      balance,
      monthly_allowance_remaining: monthly,
      free_ai_taste_remaining: taste,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", opts.userId);

  if (error) {
    return { ok: false, error: error.message, cost };
  }

  await admin.from("credit_ledger").insert({
    user_id: opts.userId,
    delta: -cost,
    reason: "ai_job",
    job_type: opts.jobType,
  });

  return { ok: true, charged: cost };
}

/** Refund credits after a failed AI job (credits return to purchased balance). */
export async function refundCredits(opts: {
  userId: string;
  amount: number;
  reason?: string;
  jobType?: string;
}) {
  if (opts.amount <= 0) return;
  await addCredits({
    userId: opts.userId,
    amount: opts.amount,
    reason: opts.reason || `refund_${opts.jobType || "ai_job"}`,
  });
}

export async function addCredits(opts: {
  userId: string;
  amount: number;
  reason: string;
  stripeEventId?: string;
}) {
  const admin = createServiceClient();

  if (opts.stripeEventId) {
    const { data: prior } = await admin
      .from("credit_ledger")
      .select("id")
      .eq("stripe_event_id", opts.stripeEventId)
      .maybeSingle();
    if (prior) return;
  }

  const { data: bal, error: readErr } = await admin
    .from("credit_balances")
    .select("balance")
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (readErr) throw new Error(`credit read failed: ${readErr.message}`);

  const next = (bal?.balance ?? 0) + opts.amount;
  const { error: upErr } = await admin.from("credit_balances").upsert({
    user_id: opts.userId,
    balance: next,
    updated_at: new Date().toISOString(),
  });
  if (upErr) throw new Error(`credit upsert failed: ${upErr.message}`);

  const { error: ledErr } = await admin.from("credit_ledger").insert({
    user_id: opts.userId,
    delta: opts.amount,
    reason: opts.reason,
    stripe_event_id: opts.stripeEventId,
  });
  if (ledErr) throw new Error(`credit ledger failed: ${ledErr.message}`);
}

export async function canCreateProject(userId: string): Promise<{
  allowed: boolean;
  reason?: "needs_unlock" | "ok";
  projectCount: number;
  tier: string;
  unlocks: number;
}> {
  const admin = createServiceClient();
  const [{ count }, { data: bal }, { count: unlockCount }] = await Promise.all([
    admin.from("projects").select("*", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("credit_balances").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("project_unlocks").select("*", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const projectCount = count ?? 0;
  const unlocks = unlockCount ?? 0;
  const tier = bal?.subscription_tier ?? "free";

  if (tier === "pro" || tier === "studio" || rowHasPro(bal as TierRow) || passRunning(bal as CreditBalance | null)) {
    return { allowed: true, reason: "ok", projectCount, tier, unlocks };
  }
  // Free: 1 project + one slot per purchased unlock
  const maxProjects = 1 + unlocks;
  if (projectCount < maxProjects) {
    return { allowed: true, reason: "ok", projectCount, tier, unlocks };
  }
  return { allowed: false, reason: "needs_unlock", projectCount, tier, unlocks };
}

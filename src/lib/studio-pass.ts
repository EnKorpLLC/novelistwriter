import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/beta-social";

/** Banked days plus days still running on an active pass can never exceed this. */
export const PASS_BANK_CAP = 28;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PassState = {
  tier: string;
  paidStudio: boolean;
  bankDays: number;
  activeUntil: string | null;
  passActive: boolean;
  /** Whole days left on a running pass, rounded up */
  daysLeft: number;
};

export async function getPassState(admin: SupabaseClient, userId: string): Promise<PassState> {
  const { data } = await admin
    .from("credit_balances")
    .select("subscription_tier, pass_bank_days, pass_active_until")
    .eq("user_id", userId)
    .maybeSingle();
  const until = data?.pass_active_until ? Date.parse(data.pass_active_until) : 0;
  const passActive = until > Date.now();
  return {
    tier: data?.subscription_tier || "free",
    paidStudio: data?.subscription_tier === "studio",
    bankDays: Math.max(0, Number(data?.pass_bank_days) || 0),
    activeUntil: passActive ? data!.pass_active_until : null,
    passActive,
    daysLeft: passActive ? Math.ceil((until - Date.now()) / DAY_MS) : 0,
  };
}

/**
 * Credit earned days once per refKey. Returns days actually credited (0 when the
 * reward already paid out or the 28-day cap is full).
 */
export async function grantPassDays(
  admin: SupabaseClient,
  opts: { userId: string; days: number; reason: string; refKey: string; meta?: Record<string, unknown>; notify?: string }
): Promise<number> {
  if (!opts.userId || opts.days <= 0) return 0;
  const { data: prior } = await admin
    .from("studio_pass_ledger")
    .select("id")
    .eq("ref_key", opts.refKey)
    .maybeSingle();
  if (prior) return 0;

  const state = await getPassState(admin, opts.userId);
  const room = Math.max(0, PASS_BANK_CAP - state.bankDays - state.daysLeft);
  const credited = Math.min(opts.days, room);
  const { error } = await admin.from("studio_pass_ledger").insert({
    user_id: opts.userId,
    days: opts.days,
    credited_days: credited,
    reason: opts.reason,
    ref_key: opts.refKey,
    meta: opts.meta || {},
  });
  // A unique-key clash means another request already paid this reward
  if (error) return 0;
  if (credited > 0) {
    await admin
      .from("credit_balances")
      .update({ pass_bank_days: state.bankDays + credited, updated_at: new Date().toISOString() })
      .eq("user_id", opts.userId);
    if (opts.notify) {
      await createNotification(admin, {
        userId: opts.userId,
        type: "studio_pass",
        title: `You earned ${credited} Studio day${credited === 1 ? "" : "s"}`,
        body: opts.notify,
        href: "/dashboard/share",
      });
    }
  }
  return credited;
}

/** Turn every banked day into a running pass, added after any time already running. */
export async function startPass(admin: SupabaseClient, userId: string): Promise<PassState> {
  const state = await getPassState(admin, userId);
  if (state.bankDays <= 0) return state;
  const from = state.activeUntil ? Date.parse(state.activeUntil) : Date.now();
  const now = new Date().toISOString();
  await admin
    .from("credit_balances")
    .update({
      pass_bank_days: 0,
      pass_active_until: new Date(from + state.bankDays * DAY_MS).toISOString(),
      pass_started_at: now,
      pass_warned_3d_at: null,
      pass_warned_1d_at: null,
      pass_ended_emailed_at: null,
      pass_ended_dismissed_at: null,
      updated_at: now,
    })
    .eq("user_id", userId);
  await admin.from("studio_pass_ledger").insert({
    user_id: userId,
    days: -state.bankDays,
    credited_days: -state.bankDays,
    reason: "pass_started",
    ref_key: `start:${userId}:${Date.now()}`,
  });
  return getPassState(admin, userId);
}

/** Unused days on a running pass go back to the bank (used when someone buys Studio). */
export async function returnActiveDaysToBank(admin: SupabaseClient, userId: string) {
  const state = await getPassState(admin, userId);
  if (!state.activeUntil) return;
  const whole = Math.floor((Date.parse(state.activeUntil) - Date.now()) / DAY_MS);
  const bank = Math.min(PASS_BANK_CAP, state.bankDays + Math.max(0, whole));
  await admin
    .from("credit_balances")
    .update({ pass_bank_days: bank, pass_active_until: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (whole > 0) {
    await admin.from("studio_pass_ledger").insert({
      user_id: userId,
      days: whole,
      credited_days: bank - state.bankDays,
      reason: "returned_on_subscribe",
      ref_key: `return:${userId}:${Date.now()}`,
    });
  }
}

/** Called around Stripe tier changes so pass days are never wasted or left behind. */
export async function onSubscriptionTierChange(
  admin: SupabaseClient,
  userId: string,
  prevTier: string | null | undefined,
  nextTier: string
) {
  try {
    if (nextTier === "studio" && prevTier !== "studio") {
      await returnActiveDaysToBank(admin, userId);
    } else if (prevTier === "studio" && nextTier !== "studio") {
      // Paying Studio subscribers who cancel fall onto their banked days, not off a cliff
      await startPass(admin, userId);
    }
  } catch (err) {
    console.error("[studio-pass] tier change handling failed", err);
  }
}

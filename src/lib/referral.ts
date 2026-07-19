import { createServiceClient } from "@/lib/supabase/admin";
import { addCredits } from "@/lib/credits";
import {
  REFERRAL_REWARD_CREDITS,
  isValidReferralCode,
} from "@/lib/referral-shared";

export {
  REFERRAL_REWARD_CREDITS,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  isValidReferralCode,
} from "@/lib/referral-shared";

function makeCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

/** Ensure the user has a shareable referral_code; return profile referral fields. */
export async function ensureReferralCode(userId: string): Promise<{
  referralCode: string;
  referredBy: string | null;
}> {
  const admin = createServiceClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("referral_code, referred_by")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (profile?.referral_code) {
    return {
      referralCode: profile.referral_code,
      referredBy: profile.referred_by ?? null,
    };
  }

  for (let i = 0; i < 5; i++) {
    const code = makeCode();
    const { data, error: upErr } = await admin
      .from("profiles")
      .update({
        referral_code: code,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .is("referral_code", null)
      .select("referral_code, referred_by")
      .maybeSingle();
    if (!upErr && data?.referral_code) {
      return {
        referralCode: data.referral_code,
        referredBy: data.referred_by ?? null,
      };
    }
  }

  const { data: again } = await admin
    .from("profiles")
    .select("referral_code, referred_by")
    .eq("id", userId)
    .maybeSingle();
  if (!again?.referral_code) throw new Error("Could not assign referral code");
  return {
    referralCode: again.referral_code,
    referredBy: again.referred_by ?? null,
  };
}

/** Attribute this user to a referrer once (from cookie/code). No-op if already set or self. */
export async function claimReferral(opts: {
  userId: string;
  code: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const code = opts.code.trim().toUpperCase();
  if (!isValidReferralCode(code)) return { ok: false, reason: "invalid_code" };

  const admin = createServiceClient();
  const { data: me } = await admin
    .from("profiles")
    .select("id, referred_by")
    .eq("id", opts.userId)
    .maybeSingle();
  if (!me) return { ok: false, reason: "no_profile" };
  if (me.referred_by) return { ok: true, reason: "already_set" };

  const { data: referrer } = await admin
    .from("profiles")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();
  if (!referrer) return { ok: false, reason: "unknown_code" };
  if (referrer.id === opts.userId) return { ok: false, reason: "self_referral" };

  const { error } = await admin
    .from("profiles")
    .update({
      referred_by: referrer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.userId)
    .is("referred_by", null);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * When a referred user pays, credit the referrer.
 * Idempotent via stripe_event_id = `${eventId}_referral`.
 */
export async function grantReferralRewardForPurchase(opts: {
  buyerUserId: string;
  stripeEventId: string;
}): Promise<{ granted: boolean; reason?: string }> {
  const admin = createServiceClient();
  const { data: buyer } = await admin
    .from("profiles")
    .select("referred_by")
    .eq("id", opts.buyerUserId)
    .maybeSingle();

  if (!buyer?.referred_by) return { granted: false, reason: "no_referrer" };
  if (buyer.referred_by === opts.buyerUserId) {
    return { granted: false, reason: "self_referral" };
  }

  const ledgerId = `${opts.stripeEventId}_referral`;
  await addCredits({
    userId: buyer.referred_by,
    amount: REFERRAL_REWARD_CREDITS,
    reason: "referral_purchase",
    stripeEventId: ledgerId,
  });
  return { granted: true };
}

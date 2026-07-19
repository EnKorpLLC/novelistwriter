/** Client- and edge-safe referral constants (no server imports). */

export const REFERRAL_REWARD_CREDITS = 50;
export const REFERRAL_COOKIE = "nw_ref";
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function isValidReferralCode(code: string): boolean {
  return /^[A-Za-z0-9]{6,16}$/.test(code.trim());
}

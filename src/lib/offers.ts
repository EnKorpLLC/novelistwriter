import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { FOUNDING_CAP, FOUNDING_PERCENT, LIFETIME } from "@/lib/plans";
import { notifyUser } from "@/lib/notifications";

export const FOUNDING_COUPON_ID = `FOUNDING${FOUNDING_PERCENT}`;
export const OFFERS_MIGRATION_HINT = "Database needs an update. Run supabase/migration_founding_lifetime.sql in the Supabase SQL editor.";

export type Offers = {
  founding: { cap: number; left: number; percent: number };
  lifetime: Record<"pro" | "studio", { cap: number; left: number; cents: number }>;
};

/** Spots left in each offer. Null before the migration has run, so pages just hide the offers. */
export async function loadOffers(admin: SupabaseClient): Promise<Offers | null> {
  const [founding, pro, studio] = await Promise.all([
    admin.from("credit_balances").select("user_id", { count: "exact", head: true }).eq("founding_member", true),
    admin.from("lifetime_purchases").select("id", { count: "exact", head: true }).eq("tier", "pro").is("refunded_at", null),
    admin.from("lifetime_purchases").select("id", { count: "exact", head: true }).eq("tier", "studio").is("refunded_at", null),
  ]);
  if (founding.error || pro.error || studio.error) return null;
  return {
    founding: { cap: FOUNDING_CAP, left: Math.max(0, FOUNDING_CAP - (founding.count || 0)), percent: FOUNDING_PERCENT },
    lifetime: {
      pro: { cap: LIFETIME.pro.cap, left: Math.max(0, LIFETIME.pro.cap - (pro.count || 0)), cents: LIFETIME.pro.cents },
      studio: { cap: LIFETIME.studio.cap, left: Math.max(0, LIFETIME.studio.cap - (studio.count || 0)), cents: LIFETIME.studio.cents },
    },
  };
}

/** For public pages: offers when the database is reachable and migrated, otherwise null so the page just hides them. */
export async function publicOffers(): Promise<Offers | null> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    return await loadOffers(createServiceClient());
  } catch {
    return null;
  }
}

/** The forever coupon, created in Stripe the first time it's needed. */
export async function ensureFoundingCoupon(): Promise<string> {
  const stripe = getStripe();
  try {
    await stripe.coupons.retrieve(FOUNDING_COUPON_ID);
  } catch {
    await stripe.coupons.create({ id: FOUNDING_COUPON_ID, percent_off: FOUNDING_PERCENT, duration: "forever", name: "Founding member" });
  }
  return FOUNDING_COUPON_ID;
}

/** Founding members always get the coupon; new subscribers get it while spots remain. */
export async function foundingDiscountFor(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data: bal, error } = await admin.from("credit_balances").select("founding_member").eq("user_id", userId).maybeSingle();
  if (error) return false;
  if (bal?.founding_member) return true;
  const offers = await loadOffers(admin);
  return Boolean(offers && offers.founding.left > 0);
}

/** After a subscription checkout that used the founding coupon. */
export async function markFoundingMember(admin: SupabaseClient, userId: string) {
  await admin.from("credit_balances").update({ founding_member: true, founding_since: new Date().toISOString() }).eq("user_id", userId).eq("founding_member", false);
}

const RANK = { pro: 1, studio: 2 } as const;

/** A paid lifetime checkout: record it, set the lifetime flag, and stop any subscription it replaces. */
export async function applyLifetimePurchase(admin: SupabaseClient, session: Stripe.Checkout.Session, userId: string) {
  const tier = session.metadata?.tier === "studio" ? "studio" : "pro";
  const { error } = await admin.from("lifetime_purchases").insert({
    user_id: userId,
    tier,
    amount_cents: session.amount_total ?? LIFETIME[tier].cents,
    stripe_session_id: session.id,
    stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
  });
  if (error && /duplicate|unique/i.test(error.message)) return;
  if (error) throw new Error(error.message);

  const { data: bal } = await admin.from("credit_balances").select("lifetime_tier, stripe_customer_id").eq("user_id", userId).maybeSingle();
  const current = bal?.lifetime_tier as "pro" | "studio" | null;
  if (!current || RANK[tier] > RANK[current]) {
    await admin.from("credit_balances").update({ lifetime_tier: tier, lifetime_since: new Date().toISOString() }).eq("user_id", userId);
  }

  // A subscription at or below the lifetime tier is no longer needed; stop it when the paid period ends
  let stopped = false;
  if (bal?.stripe_customer_id) {
    const stripe = getStripe();
    const subs = await stripe.subscriptions.list({ customer: bal.stripe_customer_id, status: "active", limit: 10 });
    for (const s of subs.data) {
      const subTier = s.metadata?.tier === "studio" ? "studio" : "pro";
      if (RANK[subTier] <= RANK[tier] && !s.cancel_at_period_end) {
        await stripe.subscriptions.update(s.id, { cancel_at_period_end: true });
        stopped = true;
      }
    }
  }
  await notifyUser(admin, userId, {
    type: "studio_pass",
    title: `Welcome, ${LIFETIME[tier].label} member`,
    body: stopped
      ? "Your lifetime plan is active. We've set your subscription to stop at the end of the period you've paid for, so you won't be charged again."
      : "Your lifetime plan is active. Thank you for backing Novelist Writer early.",
    href: "/billing",
  });
}

/** A fully refunded lifetime payment takes the lifetime plan back off the account. */
export async function revokeLifetimeForCharge(admin: SupabaseClient, charge: Stripe.Charge) {
  if (charge.amount_refunded < charge.amount) return;
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return;
  const { data: purchase } = await admin.from("lifetime_purchases").select("id, user_id").eq("stripe_payment_intent", pi).is("refunded_at", null).maybeSingle();
  if (!purchase) return;
  await admin.from("lifetime_purchases").update({ refunded_at: new Date().toISOString() }).eq("id", purchase.id);
  const { data: rest } = await admin.from("lifetime_purchases").select("tier").eq("user_id", purchase.user_id).is("refunded_at", null);
  const best = (rest || []).some((r) => r.tier === "studio") ? "studio" : (rest || []).length ? "pro" : null;
  await admin.from("credit_balances").update({ lifetime_tier: best, lifetime_since: best ? undefined : null }).eq("user_id", purchase.user_id);
}

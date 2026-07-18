import { createServiceClient } from "@/lib/supabase/admin";
import { addCredits } from "@/lib/credits";
import { CREDIT_PACKS, SUB_ALLOWANCE } from "@/lib/types";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

async function resolveUserId(session: Stripe.Checkout.Session): Promise<string | null> {
  if (session.metadata?.supabase_user_id) return session.metadata.supabase_user_id;

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customerId) return null;

  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  return customer.metadata?.supabase_user_id || null;
}

function creditsFromSession(session: Stripe.Checkout.Session): {
  credits: number;
  pack: string;
} | null {
  const fromMeta = Number(session.metadata?.credits || 0);
  if (fromMeta > 0) {
    return { credits: fromMeta, pack: session.metadata?.pack || "unknown" };
  }

  // Fallback: map line-item price id → pack size
  const priceId =
    session.line_items?.data?.[0]?.price &&
    typeof session.line_items.data[0].price !== "string"
      ? session.line_items.data[0].price.id
      : null;

  if (!priceId) return null;

  for (const [pack, def] of Object.entries(CREDIT_PACKS)) {
    if (process.env[def.envPrice] === priceId) {
      return { credits: def.credits, pack };
    }
  }
  return null;
}

/** Apply a paid Checkout session to entitlements. Idempotent via credit_ledger.stripe_event_id. */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<{
  ok: boolean;
  skipped?: string;
  applied?: string;
}> {
  if (session.payment_status && session.payment_status !== "paid" && session.mode === "payment") {
    return { ok: true, skipped: "not_paid" };
  }

  const userId = await resolveUserId(session);
  if (!userId) return { ok: false, skipped: "missing_user" };

  const kind = session.metadata?.kind;
  const admin = createServiceClient();
  const eventId = session.id;

  if (kind === "project_unlock") {
    const { data: existing } = await admin
      .from("project_unlocks")
      .select("id")
      .eq("stripe_payment_intent", String(session.payment_intent || session.id))
      .maybeSingle();
    if (existing) return { ok: true, skipped: "already_unlocked" };

    const { error } = await admin.from("project_unlocks").insert({
      user_id: userId,
      stripe_payment_intent: String(session.payment_intent || session.id),
    });
    if (error) throw new Error(`project_unlock failed: ${error.message}`);
    return { ok: true, applied: "project_unlock" };
  }

  if (kind === "credits" || (!kind && session.mode === "payment")) {
    const { data: prior } = await admin
      .from("credit_ledger")
      .select("id")
      .eq("stripe_event_id", eventId)
      .maybeSingle();
    if (prior) return { ok: true, skipped: "already_credited" };

    let packInfo = creditsFromSession(session);
    if (!packInfo && !session.line_items) {
      // Event payload often omits line_items — retrieve expanded session
      const stripe = getStripe();
      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items.data.price"],
      });
      packInfo = creditsFromSession(full);
    }

    if (!packInfo || packInfo.credits <= 0) {
      return { ok: false, skipped: "missing_credits_meta" };
    }

    await addCredits({
      userId,
      amount: packInfo.credits,
      reason: `pack_${packInfo.pack}`,
      stripeEventId: eventId,
    });
    return { ok: true, applied: `credits_${packInfo.credits}` };
  }

  if (kind === "subscribe") {
    const tier = (session.metadata?.tier || "pro") as "pro" | "studio";
    const { error } = await admin.from("credit_balances").upsert({
      user_id: userId,
      subscription_tier: tier,
      subscription_status: "active",
      monthly_allowance_remaining: SUB_ALLOWANCE[tier],
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`subscribe failed: ${error.message}`);
    return { ok: true, applied: `subscribe_${tier}` };
  }

  return { ok: true, skipped: `unknown_kind_${kind || "none"}` };
}

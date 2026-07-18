import { createServiceClient } from "@/lib/supabase/admin";
import { addCredits } from "@/lib/credits";
import { SUB_ALLOWANCE } from "@/lib/types";
import type Stripe from "stripe";

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id;
  if (!userId) return;
  const kind = session.metadata?.kind;
  const admin = createServiceClient();

  if (kind === "project_unlock") {
    await admin.from("project_unlocks").insert({
      user_id: userId,
      stripe_payment_intent: String(session.payment_intent || session.id),
    });
  }

  if (kind === "credits") {
    const credits = Number(session.metadata?.credits || 0);
    if (credits > 0) {
      await addCredits({
        userId,
        amount: credits,
        reason: `pack_${session.metadata?.pack}`,
        stripeEventId: session.id,
      });
    }
  }

  if (kind === "subscribe") {
    const tier = (session.metadata?.tier || "pro") as "pro" | "studio";
    await admin.from("credit_balances").upsert({
      user_id: userId,
      subscription_tier: tier,
      subscription_status: "active",
      monthly_allowance_remaining: SUB_ALLOWANCE[tier],
      updated_at: new Date().toISOString(),
    });
  }
}

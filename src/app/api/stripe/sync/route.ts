import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { handleCheckoutCompleted } from "@/lib/stripe-webhooks";

/**
 * Replays recent paid Checkout sessions for the signed-in user.
 * Use after a webhook miss (e.g. /billing?success=credits).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const { data: bal } = await admin
    .from("credit_balances")
    .select("stripe_customer_id, balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!bal?.stripe_customer_id) {
    return NextResponse.json({
      ok: true,
      applied: [],
      balance: bal?.balance ?? 0,
      note: "No Stripe customer yet",
    });
  }

  const stripe = getStripe();
  const sessions = await stripe.checkout.sessions.list({
    customer: bal.stripe_customer_id,
    limit: 20,
  });

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const session of sessions.data) {
    if (session.status !== "complete") continue;
    if (session.payment_status !== "paid" && session.mode === "payment") continue;

    try {
      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items.data.price"],
      });
      // Ensure user metadata is present for older sessions
      if (!full.metadata?.supabase_user_id) {
        full.metadata = {
          ...(full.metadata || {}),
          supabase_user_id: user.id,
        };
      }
      const result = await handleCheckoutCompleted(full);
      if (result.applied) applied.push(`${session.id}:${result.applied}`);
      else if (result.skipped) skipped.push(`${session.id}:${result.skipped}`);
    } catch (err) {
      skipped.push(
        `${session.id}:error:${err instanceof Error ? err.message : "failed"}`
      );
    }
  }

  const { data: fresh } = await admin
    .from("credit_balances")
    .select("balance, monthly_allowance_remaining")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    applied,
    skipped,
    balance: fresh?.balance ?? 0,
    monthly: fresh?.monthly_allowance_remaining ?? 0,
  });
}

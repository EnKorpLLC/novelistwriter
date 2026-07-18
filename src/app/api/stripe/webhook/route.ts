import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { handleCheckoutCompleted } from "@/lib/stripe-webhooks";
import { createServiceClient } from "@/lib/supabase/admin";
import { SUB_ALLOWANCE } from "@/lib/types";
import Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing webhook config" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid signature" },
      { status: 400 }
    );
  }

  const admin = createServiceClient();

  try {
    if (event.type === "checkout.session.completed") {
      const result = await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      if (!result.ok && result.skipped === "missing_user") {
        console.error("stripe webhook: checkout missing user metadata", event.id);
        return NextResponse.json({ error: "missing user metadata" }, { status: 500 });
      }
      if (!result.ok && result.skipped === "missing_credits_meta") {
        console.error("stripe webhook: checkout missing credits metadata", event.id);
        return NextResponse.json({ error: "missing credits metadata" }, { status: 500 });
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (userId) {
        const active = sub.status === "active" || sub.status === "trialing";
        const tier = active ? ((sub.metadata?.tier as "pro" | "studio") || "pro") : "free";
        const { error } = await admin.from("credit_balances").upsert({
          user_id: userId,
          subscription_tier: active ? tier : "free",
          subscription_status: sub.status,
          subscription_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          monthly_allowance_remaining:
            active && (tier === "pro" || tier === "studio") ? SUB_ALLOWANCE[tier] : 0,
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
      }
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const subId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        const userId = sub.metadata?.supabase_user_id;
        const tier = (sub.metadata?.tier as "pro" | "studio") || "pro";
        if (userId && (tier === "pro" || tier === "studio")) {
          const { error } = await admin
            .from("credit_balances")
            .update({
              monthly_allowance_remaining: SUB_ALLOWANCE[tier],
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          if (error) throw new Error(error.message);
        }
      }
    }
  } catch (err) {
    console.error("stripe webhook handler error", event.type, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

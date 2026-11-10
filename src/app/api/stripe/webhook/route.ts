import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { handleCheckoutCompleted } from "@/lib/stripe-webhooks";
import { createServiceClient } from "@/lib/supabase/admin";
import { SUB_ALLOWANCE } from "@/lib/types";
import { grantReferralRewardForPurchase } from "@/lib/referral";
import { onSubscriptionTierChange } from "@/lib/studio-pass";
import { recordInvoice, recordRefund } from "@/lib/money";
import { adjustForCharge, recordCommissionForInvoice } from "@/lib/affiliates";
import { revokeLifetimeForCharge } from "@/lib/offers";
import { adjustBookPurchaseForCharge, recordBookPurchase } from "@/lib/direct-sales";
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
    const completed = event.type === "checkout.session.completed" ? (event.data.object as Stripe.Checkout.Session) : null;
    if (completed?.metadata?.kind === "book_purchase") {
      // Guest buyers have no account yet, so book sales skip the account-based handler
      const result = await recordBookPurchase(admin, completed.id);
      if (!result.ok) console.error("stripe webhook: book purchase not recorded", event.id, result.skipped);
    } else if (event.type === "checkout.session.completed") {
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
        const { data: before } = await admin
          .from("credit_balances")
          .select("subscription_tier")
          .eq("user_id", userId)
          .maybeSingle();
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
        await onSubscriptionTierChange(admin, userId, before?.subscription_tier, active ? tier : "free");
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
        await recordInvoice(admin, invoice, sub);
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
        if (userId) {
          try {
            await recordCommissionForInvoice(admin, invoice, userId);
          } catch (err) {
            console.error("affiliate commission failed", invoice.id, err);
          }
        }
        // Renewals only — first payment already rewarded via checkout.session.completed
        if (
          userId &&
          invoice.billing_reason === "subscription_cycle" &&
          (invoice.amount_paid ?? 0) > 0
        ) {
          try {
            await grantReferralRewardForPurchase({
              buyerUserId: userId,
              stripeEventId: invoice.id,
            });
          } catch (err) {
            console.error("referral renewal reward failed", invoice.id, err);
          }
        }
      }
    }
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      try {
        const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 });
        for (const r of refunds.data) await recordRefund(admin, r);
      } catch (err) {
        // Money tracking never fails the webhook; "Sync from Stripe" catches up later
        console.error("refund record failed", charge.id, err);
      }
      try {
        await adjustForCharge(admin, charge.id, charge.amount ? charge.amount_refunded / charge.amount : 1, "Refunded");
      } catch (err) {
        console.error("affiliate refund adjustment failed", charge.id, err);
      }
      try {
        await revokeLifetimeForCharge(admin, charge);
      } catch (err) {
        console.error("lifetime refund handling failed", charge.id, err);
      }
      try {
        await adjustBookPurchaseForCharge(admin, charge, "refunded");
      } catch (err) {
        console.error("book refund handling failed", charge.id, err);
      }
    }
    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
      try {
        await adjustForCharge(admin, chargeId, 1, "Disputed");
      } catch (err) {
        console.error("affiliate dispute adjustment failed", chargeId, err);
      }
      try {
        await adjustBookPurchaseForCharge(admin, await stripe.charges.retrieve(chargeId), "disputed");
      } catch (err) {
        console.error("book dispute handling failed", chargeId, err);
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

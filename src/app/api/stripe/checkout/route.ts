import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, appUrl } from "@/lib/stripe";
import { CREDIT_PACKS } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/admin";

async function ensureCustomer(userId: string, email: string) {
  const admin = createServiceClient();
  const { data: bal } = await admin
    .from("credit_balances")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (bal?.stripe_customer_id) return bal.stripe_customer_id as string;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });
  await admin.from("credit_balances").upsert({
    user_id: userId,
    stripe_customer_id: customer.id,
    updated_at: new Date().toISOString(),
  });
  return customer.id;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const kind = body.kind as string;
  const stripe = getStripe();
  const customerId = await ensureCustomer(user.id, user.email || "");

  if (kind === "project_unlock") {
    const price = process.env.STRIPE_PRICE_PROJECT_UNLOCK;
    if (!price) {
      return NextResponse.json({ error: "Project unlock price not configured" }, { status: 500 });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: appUrl("/billing?success=unlock"),
      cancel_url: appUrl("/billing?canceled=1"),
      metadata: { supabase_user_id: user.id, kind: "project_unlock" },
      payment_intent_data: {
        metadata: { supabase_user_id: user.id, kind: "project_unlock" },
      },
    });
    return NextResponse.json({ url: session.url });
  }

  if (kind === "credits") {
    const pack = body.pack as keyof typeof CREDIT_PACKS;
    const packDef = CREDIT_PACKS[pack];
    if (!packDef) return NextResponse.json({ error: "Unknown pack" }, { status: 400 });
    const price = process.env[packDef.envPrice];
    if (!price) return NextResponse.json({ error: "Pack price not configured" }, { status: 500 });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: appUrl("/billing?success=credits"),
      cancel_url: appUrl("/billing?canceled=1"),
      metadata: {
        supabase_user_id: user.id,
        kind: "credits",
        pack,
        credits: String(packDef.credits),
      },
      payment_intent_data: {
        metadata: {
          supabase_user_id: user.id,
          kind: "credits",
          pack,
          credits: String(packDef.credits),
        },
      },
    });
    return NextResponse.json({ url: session.url });
  }

  if (kind === "subscribe") {
    const tier = body.tier as "pro" | "studio";
    const interval = (body.interval as "monthly" | "yearly") || "monthly";
    const envKey =
      tier === "pro"
        ? interval === "yearly"
          ? "STRIPE_PRICE_PRO_YEARLY"
          : "STRIPE_PRICE_PRO_MONTHLY"
        : interval === "yearly"
          ? "STRIPE_PRICE_STUDIO_YEARLY"
          : "STRIPE_PRICE_STUDIO_MONTHLY";
    const price = process.env[envKey];
    if (!price) {
      return NextResponse.json({ error: "Subscription price not configured" }, { status: 500 });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: appUrl("/billing?success=sub"),
      cancel_url: appUrl("/billing?canceled=1"),
      metadata: { supabase_user_id: user.id, kind: "subscribe", tier },
      subscription_data: { metadata: { supabase_user_id: user.id, tier } },
    });
    return NextResponse.json({ url: session.url });
  }

  if (kind === "portal") {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: appUrl("/billing"),
    });
    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}

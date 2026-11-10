import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SALES_MIGRATION_HINT, refreshSellerPayouts, sellerOnboardingUrl, sellerStatus, sellerSummary } from "@/lib/direct-sales";
import { getStripe } from "@/lib/stripe";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The author's seller status and sales totals. */
export async function GET(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  // Coming back from Stripe onboarding: check whether payouts are ready now
  if (new URL(req.url).searchParams.get("refresh")) await refreshSellerPayouts(admin, user.id).catch(() => null);
  const status = await sellerStatus(admin, user.id);
  if ("migrationNeeded" in status) return NextResponse.json({ migrationNeeded: true, error: SALES_MIGRATION_HINT });
  const summary = await sellerSummary(admin, user.id).catch(() => null);
  return NextResponse.json({ ...status, summary });
}

/** { action: "accept_terms" } or { action: "onboard", returnPath } */
export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const body = (await req.json().catch(() => ({}))) as { action?: string; returnPath?: string };
  const status = await sellerStatus(admin, user.id);
  if ("migrationNeeded" in status) return NextResponse.json({ error: SALES_MIGRATION_HINT }, { status: 500 });
  if (!status.tier) return NextResponse.json({ error: "Selling direct is part of Pro and Studio." }, { status: 402 });

  if (body.action === "accept_terms") {
    const { error } = await admin.from("seller_accounts").upsert({ user_id: user.id, terms_accepted_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return NextResponse.json({ error: SALES_MIGRATION_HINT }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  // Stripe's own payout page for this author: bank details, payout dates, tax forms
  if (body.action === "stripe_dashboard") {
    const { data: acct } = await admin.from("seller_accounts").select("stripe_account_id").eq("user_id", user.id).maybeSingle();
    if (!acct?.stripe_account_id) return NextResponse.json({ error: "Set up payouts first." }, { status: 400 });
    try {
      const link = await getStripe().accounts.createLoginLink(acct.stripe_account_id);
      return NextResponse.json({ url: link.url });
    } catch {
      return NextResponse.json({ error: "Finish payout setup with Stripe first." }, { status: 400 });
    }
  }
  if (body.action === "onboard") {
    const returnPath = /^\/[\w\-/?=&]*$/.test(String(body.returnPath || "")) ? String(body.returnPath) : "/dashboard";
    try {
      return NextResponse.json({ url: await sellerOnboardingUrl(admin, user.id, user.email || null, returnPath) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start payout setup" }, { status: 400 });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

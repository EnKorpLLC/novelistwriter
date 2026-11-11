import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { refreshSellerPayouts } from "@/lib/direct-sales";
import { narratorPayoutUrl } from "@/lib/narration-money";
import { JOBS_HINT } from "@/lib/market-jobs";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The pro's payout account and what marketplace jobs have paid them. */
export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const [{ data: acct }, payouts] = await Promise.all([
    admin.from("seller_accounts").select("stripe_account_id, payouts_enabled").eq("user_id", user.id).maybeSingle(),
    admin.from("market_payouts").select("amount_cents, status").eq("pro_id", user.id).limit(1000),
  ]);
  if (payouts.error) return NextResponse.json({ migrationNeeded: true, error: JOBS_HINT });
  const enabled = acct?.stripe_account_id ? await refreshSellerPayouts(admin, user.id).catch(() => Boolean(acct.payouts_enabled)) : false;
  const rows = payouts.data || [];
  return NextResponse.json({
    hasAccount: Boolean(acct?.stripe_account_id),
    payoutsEnabled: enabled,
    paidCents: rows.filter((p) => p.status === "paid").reduce((n, p) => n + p.amount_cents, 0),
    waitingCents: rows.filter((p) => p.status === "pending" || p.status === "failed").reduce((n, p) => n + p.amount_cents, 0),
  });
}

/** { action: "onboard" } → Stripe's payout setup; { action: "stripe_dashboard" } → their Stripe Express dashboard. */
export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (b.action === "onboard") return NextResponse.json({ url: await narratorPayoutUrl(admin, user.id, user.email || null, "/pro") });
    if (b.action === "stripe_dashboard") {
      const { data } = await admin.from("seller_accounts").select("stripe_account_id").eq("user_id", user.id).maybeSingle();
      if (!data?.stripe_account_id) return NextResponse.json({ error: "Set up payouts first." }, { status: 400 });
      const link = await getStripe().accounts.createLoginLink(data.stripe_account_id as string);
      return NextResponse.json({ url: link.url });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe isn't available right now." }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

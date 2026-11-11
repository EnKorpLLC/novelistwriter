import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { refreshSellerPayouts } from "@/lib/direct-sales";
import { MONEY_HINT, narratorPayoutUrl } from "@/lib/narration-money";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The narrator's payout account and what they've been paid. */
export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const [{ data: acct }, payouts] = await Promise.all([
    admin.from("seller_accounts").select("stripe_account_id, payouts_enabled").eq("user_id", user.id).maybeSingle(),
    admin.from("narration_payouts").select("amount_cents, status, reason, created_at, paid_at, job_id").eq("narrator_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (payouts.error) return NextResponse.json({ migrationNeeded: true, error: MONEY_HINT });
  const enabled = acct?.stripe_account_id ? await refreshSellerPayouts(admin, user.id).catch(() => Boolean(acct.payouts_enabled)) : false;
  const rows = payouts.data || [];
  return NextResponse.json({
    hasAccount: Boolean(acct?.stripe_account_id),
    payoutsEnabled: enabled,
    paidCents: rows.filter((p) => p.status === "paid").reduce((n, p) => n + p.amount_cents, 0),
    waitingCents: rows.filter((p) => p.status === "pending" || p.status === "failed").reduce((n, p) => n + p.amount_cents, 0),
    payouts: rows.map((p) => ({ amountCents: p.amount_cents, status: p.status, reason: p.reason, createdAt: p.created_at, paidAt: p.paid_at })),
  });
}

/** { action: "onboard" } → Stripe's payout setup; { action: "stripe_dashboard" } → their Stripe Express dashboard. */
export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (b.action === "onboard") return NextResponse.json({ url: await narratorPayoutUrl(admin, user.id, user.email || null) });
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

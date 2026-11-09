import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { connectOnboardingUrl } from "@/lib/affiliates";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Start or finish payout setup: Stripe's hosted form verifies identity and bank details. */
export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { country?: string };
  try {
    const url = await connectOnboardingUrl(createServiceClient(), user.id, String(body.country || "US"), user.email || null);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start payout setup";
    // Connect has to be switched on in the Stripe dashboard before accounts can be created
    const hint = /connect|platform|signed up/i.test(message) ? "Payouts aren't switched on yet. We'll let you know as soon as they are." : message;
    return NextResponse.json({ error: hint }, { status: 400 });
  }
}

/** Stripe's payout dashboard for the affiliate: bank details, payout history, tax forms. */
export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: aff } = await createServiceClient().from("affiliates").select("stripe_account_id").eq("user_id", user.id).maybeSingle();
  if (!aff?.stripe_account_id) return NextResponse.json({ error: "Set up payouts first." }, { status: 400 });
  try {
    const link = await getStripe().accounts.createLoginLink(aff.stripe_account_id);
    return NextResponse.json({ url: link.url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not open Stripe" }, { status: 400 });
  }
}

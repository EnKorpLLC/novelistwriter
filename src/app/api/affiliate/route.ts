import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureReferralCode } from "@/lib/referral";
import { appUrl } from "@/lib/stripe";
import { notifyUser } from "@/lib/notifications";
import { AFFILIATES_MIGRATION_HINT, PAYOUT_COUNTRIES, affiliateSummary, isMissingAffiliateTable, refreshPayoutStatus } from "@/lib/affiliates";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Your affiliate status, link, earnings, and payout setup. */
export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const { data: aff, error } = await admin.from("affiliates").select("*").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ migrationNeeded: isMissingAffiliateTable(error.message), error: AFFILIATES_MIGRATION_HINT });
  if (!aff) return NextResponse.json({ status: "none", countries: PAYOUT_COUNTRIES });

  let payouts = { enabled: Boolean(aff.payouts_enabled), detailsSubmitted: Boolean(aff.payouts_enabled) };
  if (aff.status === "approved" && aff.stripe_account_id && !aff.payouts_enabled) {
    payouts = await refreshPayoutStatus(admin, user.id, aff.stripe_account_id).catch(() => payouts);
  }
  const { referralCode } = await ensureReferralCode(user.id);
  return NextResponse.json({
    status: aff.status,
    appliedAt: aff.applied_at,
    adminNote: aff.status === "rejected" ? aff.admin_note : "",
    countries: PAYOUT_COUNTRIES,
    country: aff.country,
    hasPayoutAccount: Boolean(aff.stripe_account_id),
    payoutsEnabled: payouts.enabled,
    detailsSubmitted: payouts.detailsSubmitted,
    link: aff.status === "approved" ? appUrl(`/?ref=${referralCode}`) : null,
    signupLink: aff.status === "approved" ? appUrl(`/signup?ref=${referralCode}`) : null,
    summary: aff.status === "approved" ? await affiliateSummary(admin, user.id) : null,
  });
}

/** Apply to the program. */
export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { website?: string; audience?: string; agree?: boolean };
  if (!body.agree) return NextResponse.json({ error: "Please read and agree to the program terms." }, { status: 400 });
  const audience = String(body.audience || "").trim();
  if (audience.length < 20) return NextResponse.json({ error: "Tell us a little about where and how you'll share Novelist Writer." }, { status: 400 });
  const admin = createServiceClient();
  const { data: existing } = await admin.from("affiliates").select("status").eq("user_id", user.id).maybeSingle();
  if (existing && existing.status !== "rejected") return NextResponse.json({ error: "You've already applied." }, { status: 400 });
  const now = new Date().toISOString();
  const { error } = await admin.from("affiliates").upsert({
    user_id: user.id,
    status: "applied",
    website: String(body.website || "").trim().slice(0, 300),
    audience: audience.slice(0, 1500),
    agreed_terms_at: now,
    applied_at: now,
    decided_at: null,
  });
  if (error) return NextResponse.json({ error: isMissingAffiliateTable(error.message) ? AFFILIATES_MIGRATION_HINT : error.message }, { status: 500 });
  await notifyUser(admin, user.id, {
    type: "affiliate",
    title: "We got your affiliate application",
    body: "We review applications by hand, usually within a few days. You'll hear from us either way.",
    href: "/dashboard/affiliate",
  });
  return NextResponse.json({ ok: true });
}

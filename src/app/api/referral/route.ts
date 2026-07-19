import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  REFERRAL_COOKIE,
  claimReferral,
  ensureReferralCode,
  isValidReferralCode,
} from "@/lib/referral";
import { appUrl } from "@/lib/stripe";

/** GET: referral link for the signed-in user. POST: claim cookie/code attribution. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { referralCode, referredBy } = await ensureReferralCode(user.id);
    const link = appUrl(`/signup?ref=${referralCode}`);
    return NextResponse.json({
      code: referralCode,
      link,
      referredBy: !!referredBy,
      rewardCredits: 50,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const jar = await cookies();
  const fromBody = typeof body.code === "string" ? body.code : "";
  const fromCookie = jar.get(REFERRAL_COOKIE)?.value || "";
  const code = (fromBody || fromCookie).trim().toUpperCase();

  if (!code || !isValidReferralCode(code)) {
    return NextResponse.json({ ok: false, reason: "no_code" });
  }

  const result = await claimReferral({ userId: user.id, code });
  return NextResponse.json(result);
}

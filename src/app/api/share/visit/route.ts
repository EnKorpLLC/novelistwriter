import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createHash, randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isValidReferralCode } from "@/lib/referral-shared";

const VISITOR_COOKIE = "nw_vid";
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|curl|wget/i;

/** One counted arrival per visitor per author per day, through that author's share link. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { ref?: string; path?: string };
  const code = String(body.ref || "").trim().toUpperCase();
  if (!isValidReferralCode(code)) return NextResponse.json({ ok: false });

  const hdrs = await headers();
  const ua = hdrs.get("user-agent") || "";
  if (!ua || BOT_UA.test(ua)) return NextResponse.json({ ok: false });

  const admin = createServiceClient();
  const { data: referrer } = await admin
    .from("profiles")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();
  if (!referrer) return NextResponse.json({ ok: false });

  // Your own clicks on your own link don't count
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === referrer.id) return NextResponse.json({ ok: false, reason: "self" });

  // Network + browser identifies a visitor, so clearing cookies can't inflate the count.
  // The cookie only stands in when there's no forwarded IP (local development).
  const res = NextResponse.json({ ok: true });
  const ip = (hdrs.get("x-forwarded-for") || "").split(",")[0].trim();
  let identity = ip ? `${ip}|${ua}` : "";
  if (!identity) {
    const jar = await cookies();
    let visitorId = jar.get(VISITOR_COOKIE)?.value || "";
    if (!/^[0-9a-f-]{36}$/.test(visitorId)) {
      visitorId = randomUUID();
      res.cookies.set(VISITOR_COOKIE, visitorId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });
    }
    identity = visitorId;
  }
  const visitorHash = createHash("sha256").update(identity).digest("hex").slice(0, 32);
  const day = new Date().toISOString().slice(0, 10);

  await admin.from("share_visits").upsert(
    {
      referrer_user_id: referrer.id,
      visitor_hash: visitorHash,
      day,
      path: String(body.path || "").slice(0, 200),
    },
    { onConflict: "referrer_user_id,visitor_hash,day", ignoreDuplicates: true }
  );
  return res;
}

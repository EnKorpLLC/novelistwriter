import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|curl|wget|monitor/i;

function clean(v: unknown, max = 80) {
  const s = String(v || "").trim().toLowerCase().slice(0, max);
  return s || null;
}

/**
 * Collapse private or per-item URLs so the report groups them: every book and author page
 * stays readable, but project and reading pages don't list one row per manuscript.
 */
function groupPath(path: string) {
  return path
    .replace(/^\/project\/[^/]+.*$/, "/project/[id]")
    .replace(/^\/beta\/(read|book|apply)\/[^/]+.*$/, "/beta/$1/[id]")
    .replace(/^\/arc\/book\/[^/]+.*$/, "/arc/book/[id]")
    .replace(/^\/beta\/[0-9a-f]{20,}$/, "/beta/[token]")
    .slice(0, 160);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawPath = String(body.path || "");
  if (!rawPath.startsWith("/") || rawPath.startsWith("/api") || rawPath.startsWith("/admin")) {
    return NextResponse.json({ ok: false });
  }
  const hdrs = await headers();
  const ua = hdrs.get("user-agent") || "";
  if (!ua || BOT_UA.test(ua)) return NextResponse.json({ ok: false });

  const day = new Date().toISOString().slice(0, 10);
  const ip = (hdrs.get("x-forwarded-for") || "").split(",")[0].trim();
  // Daily-rotating hash: counts unique visitors per day without tracking anyone across days
  const visitorHash = createHash("sha256")
    .update(`${day}|${ip}|${ua}|${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-12) || ""}`)
    .digest("hex")
    .slice(0, 32);
  const jar = await cookies();
  const signedIn = jar.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  await createServiceClient()
    .from("site_page_views")
    .insert({
      day,
      path: groupPath(rawPath),
      referrer_host: clean(body.referrerHost, 120),
      utm_source: clean(body.utm_source),
      utm_medium: clean(body.utm_medium),
      utm_campaign: clean(body.utm_campaign),
      visitor_hash: visitorHash,
      signed_in: signedIn,
    });
  return NextResponse.json({ ok: true });
}

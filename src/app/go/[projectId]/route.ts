import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { normalizeBuyLinks } from "@/lib/arc";

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|curl|wget|monitor/i;

/** L4: launch page buy buttons come through here so the launch dashboard can count clicks per store. */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const label = new URL(req.url).searchParams.get("s") || "";
  const admin = createServiceClient();
  const { data: project } = await admin.from("projects").select("id, buy_links").eq("id", projectId).maybeSingle();
  const link = normalizeBuyLinks(project?.buy_links).find((l) => l.label === label);
  if (!link || !/^https?:\/\//i.test(link.url)) return NextResponse.redirect(new URL("/books", req.url));

  const hdrs = await headers();
  const ua = hdrs.get("user-agent") || "";
  if (ua && !BOT_UA.test(ua)) {
    const day = new Date().toISOString().slice(0, 10);
    const ip = (hdrs.get("x-forwarded-for") || "").split(",")[0].trim();
    // Same daily-rotating visitor hash as page views: unique clicks per day, no one tracked across days
    const visitorHash = createHash("sha256")
      .update(`${day}|${ip}|${ua}|${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-12) || ""}`)
      .digest("hex")
      .slice(0, 32);
    const row: Record<string, unknown> = { project_id: projectId, store: link.label.slice(0, 60), day, visitor_hash: visitorHash };
    // A group promo page tags its buttons so the click is credited to the promo
    const src = new URL(req.url).searchParams.get("src") || "";
    const { error } = await admin.from("buy_clicks").insert(/^[a-z0-9-]{1,80}$/.test(src) ? { ...row, source: src } : row);
    if (error && /source/.test(error.message)) await admin.from("buy_clicks").insert(row);
  }
  return NextResponse.redirect(link.url, 302);
}

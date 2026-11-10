import { NextResponse } from "next/server";
import { siteText } from "@/lib/site-text";
import { SITE_TEXT_BY_KEY } from "@/lib/site-text-registry";

/** Public site wording for pages that render in the browser (Billing's plan lists). */
export async function GET(req: Request) {
  const keys = (new URL(req.url).searchParams.get("keys") || "").split(",").filter((k) => SITE_TEXT_BY_KEY.has(k)).slice(0, 20);
  const blocks = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await siteText(k)] as const)));
  return NextResponse.json({ blocks }, { headers: { "Cache-Control": "public, max-age=60" } });
}

import { findVerification } from "@/lib/verify";
import { badgeSvg } from "@/lib/verify-badge";

/** The embeddable badge. It always shows the book's current state, so turning verification off updates it everywhere. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { v } = await findVerification((await params).code);
  const dark = new URL(req.url).searchParams.get("theme") === "dark";
  const svg = badgeSvg({
    right: v ? `✓ ${v.label}` : "Not verified",
    on: Boolean(v),
    dark,
    title: v ? `${v.title} by ${v.author}: ${v.label}. Check the writing record at ${v.url}` : "No verification for this code",
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": v ? "public, s-maxage=3600, stale-while-revalidate=86400" : "public, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

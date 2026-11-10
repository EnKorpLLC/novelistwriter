import { findVerification } from "@/lib/verify";
import { renderButtonImage } from "@/lib/og-image";

/** The verification badge as a PNG, for newsletters and editors that don't show SVG. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { v } = await findVerification((await params).code);
  const image = renderButtonImage({ label: v ? v.label : "Not verified", check: Boolean(v), muted: !v, dark: new URL(req.url).searchParams.get("theme") === "dark" });
  image.headers.set("Cache-Control", v ? "public, s-maxage=3600, stale-while-revalidate=86400" : "public, s-maxage=300");
  image.headers.set("Access-Control-Allow-Origin", "*");
  return image;
}

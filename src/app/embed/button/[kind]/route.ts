import { embedButton } from "@/lib/embed-buttons";
import { renderButtonImage } from "@/lib/og-image";

/** PNG buttons for newsletters (email apps don't show SVG or styled links reliably). Same image for every author. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const b = embedButton((await params).kind.replace(/\.png$/, ""));
  if (!b) return new Response("Not found", { status: 404 });
  const image = renderButtonImage({ label: b.label, dark: new URL(req.url).searchParams.get("theme") === "dark" });
  image.headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
  image.headers.set("Access-Control-Allow-Origin", "*");
  return image;
}

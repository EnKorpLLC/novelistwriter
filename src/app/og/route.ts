import { renderShareImage } from "@/lib/og-image";

/** Share images for Novelist Writer's own pages (tools, comparisons, guides): /og?t=Title&k=Kicker&s=Subtitle */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const clip = (v: string | null, n: number) => String(v || "").slice(0, n);
  return renderShareImage({
    width: 1200,
    height: 630,
    title: clip(q.get("t"), 90) || "Novelist Writer",
    kicker: clip(q.get("k"), 40) || "Novelist Writer",
    subtitle: clip(q.get("s"), 120) || "Write it yourself. Prove it.",
    image: null,
  });
}

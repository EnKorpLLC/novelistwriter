import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { imageAsDataUrl, renderShareImage } from "@/lib/og-image";

/** Image for a social post: square for Instagram and most feeds, wide for link cards. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const square = new URL(req.url).searchParams.get("size") === "square";
  const { data: post } = await createServiceClient()
    .from("social_posts")
    .select("image_title, image_subtitle, image_kicker, image_cover_url, status")
    .eq("id", id)
    .maybeSingle();
  if (!post || post.status === "skipped") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return renderShareImage({
    ...(square ? { width: 1080, height: 1080 } : { width: 1200, height: 630 }),
    kicker: post.image_kicker,
    title: post.image_title,
    subtitle: post.image_subtitle,
    image: await imageAsDataUrl(post.image_cover_url),
  });
}

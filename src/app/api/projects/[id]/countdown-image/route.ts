import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { imageAsDataUrl, renderShareImage } from "@/lib/og-image";
import { normalizeDetails } from "@/lib/book/format";

/** "7 days to go" images for the launch countdown, downloaded by the author. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const days = Math.max(0, Math.min(365, Math.round(Number(url.searchParams.get("days")) || 0)));
  const square = url.searchParams.get("size") === "square";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [{ data: project }, { data: profile }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const author = normalizeDetails(project.book_details).penName || profile?.display_name || "";
  const release = project.release_date
    ? new Date(`${project.release_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })
    : "";
  const image = await renderShareImage({
    ...(square ? { width: 1080, height: 1080 } : { width: 1200, height: 630 }),
    kicker: days === 0 ? "Out today" : days === 1 ? "1 day to go" : `${days} days to go`,
    title: project.title || "Untitled",
    subtitle: author ? `by ${author}` : release,
    badge: days > 0 && release ? `Out ${release}` : null,
    image: await imageAsDataUrl(coverPublicUrl(projectCoverPath(project))),
  });
  image.headers.set("Content-Disposition", `attachment; filename="countdown-${days}-days${square ? "-square" : ""}.png"`);
  return image;
}

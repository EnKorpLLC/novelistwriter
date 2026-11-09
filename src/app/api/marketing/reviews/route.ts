import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";

/** ARC reviews for review cards (Studio). Readers show by first name only; authors choose the attribution. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasStudio(user.id))) return NextResponse.json({ error: "Review cards are part of Studio.", code: "studio_required" }, { status: 403 });
  const projectId = new URL(req.url).searchParams.get("projectId") || "";
  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: rows } = await createServiceClient()
    .from("arc_invites")
    .select("display_name, review_body, finished_at")
    .eq("project_id", projectId)
    .not("review_body", "is", null)
    .order("finished_at", { ascending: false })
    .limit(100);
  return NextResponse.json({
    reviews: (rows || [])
      .filter((r) => String(r.review_body || "").trim())
      .map((r) => ({ text: String(r.review_body).trim(), firstName: String(r.display_name || "").trim().split(/\s+/)[0] || null })),
  });
}

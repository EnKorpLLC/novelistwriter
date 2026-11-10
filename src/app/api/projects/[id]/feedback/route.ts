import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadReaderFeedback } from "@/lib/reader-feedback";
import { userHasStudio } from "@/lib/credits";

/**
 * Reader comments on one chapter, for the feedback column beside the editor. Owner on Studio only.
 * Without chapterId, returns how many reader comments the book has (the count only, even without
 * Studio, so a lapsed author can see what's waiting).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const chapterId = new URL(req.url).searchParams.get("chapterId") || "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createServiceClient();
  const studio = await userHasStudio(user.id);
  if (!chapterId) {
    const { count } = await admin
      .from("beta_comments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("author_user_id", null);
    return NextResponse.json({ total: count || 0, studio });
  }
  if (!studio) {
    return NextResponse.json(
      { error: "Reader feedback is included with Studio.", code: "studio_required" },
      { status: 403 }
    );
  }

  const feedback = await loadReaderFeedback(admin, projectId, { chapterId });
  // Readers see "Seen by the author" once their notes have been opened here
  await admin
    .from("beta_comments")
    .update({ author_seen_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("chapter_id", chapterId)
    .is("author_user_id", null)
    .is("author_seen_at", null);
  return NextResponse.json({ comments: feedback.comments.filter((c) => !c.fromAuthor) });
}

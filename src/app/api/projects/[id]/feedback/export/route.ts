import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { feedbackDocx, loadReaderFeedback } from "@/lib/reader-feedback";

export const maxDuration = 60;

/**
 * Beta comments, final reviews, DNF reasons, and ARC reviews as a Word document. Owner only, and
 * never behind Studio: it's the author's own feedback.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const q = new URL(req.url).searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: project } = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const chapterParam = (q.get("chapters") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const feedback = await loadReaderFeedback(createServiceClient(), projectId);
  const buf = await feedbackDocx(feedback, {
    includeBeta: q.get("beta") !== "0",
    includeArc: q.get("arc") !== "0",
    reviewsOnly: q.get("reviewsOnly") === "1",
    openOnly: q.get("openOnly") === "1",
    chapterIds: chapterParam.length ? new Set(chapterParam.filter((c) => c !== "general")) : null,
    includeGeneral: !chapterParam.length || chapterParam.includes("general"),
  });

  const safeName = (project.title || "book").replace(/[^\w\- ]+/g, "").trim() || "book";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName} - reader feedback.docx"`,
    },
  });
}

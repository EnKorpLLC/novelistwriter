import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { jobFromRow } from "@/lib/narration-access";

/** The narrator dashboard: invites waiting for an answer, and books under way or finished. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const [mine, invited] = await Promise.all([
    admin.from("narrator_jobs").select("*").eq("narrator_id", user.id).order("updated_at", { ascending: false }).limit(100),
    admin.from("narrator_jobs").select("*").ilike("invite_email", user.email || "-").eq("status", "invited").order("created_at", { ascending: false }),
  ]);
  if (mine.error) return NextResponse.json({ migrationNeeded: true, jobs: [] });
  const rows = [...(invited.data || []), ...(mine.data || []).filter((r) => r.status !== "invited")];
  const projectIds = [...new Set(rows.map((r) => r.project_id as string))];
  const authorIds = [...new Set(rows.map((r) => r.author_id as string))];
  const [projects, authors, chapters, takes, approved] = await Promise.all([
    projectIds.length ? admin.from("projects").select("id, title").in("id", projectIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    authorIds.length ? admin.from("profiles").select("id, display_name").in("id", authorIds) : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    projectIds.length ? admin.from("chapters").select("id, project_id").in("project_id", projectIds) : Promise.resolve({ data: [] as { id: string; project_id: string }[] }),
    projectIds.length ? admin.from("audio_takes").select("chapter_id, project_id").in("project_id", projectIds).eq("user_id", user.id) : Promise.resolve({ data: [] as { chapter_id: string; project_id: string }[] }),
    projectIds.length ? admin.from("audio_chapters").select("project_id, status").in("project_id", projectIds).eq("status", "approved") : Promise.resolve({ data: [] as { project_id: string; status: string }[] }),
  ]);
  const title = new Map((projects.data || []).map((p) => [p.id, (p.title as string) || "Untitled"]));
  const author = new Map((authors.data || []).map((a) => [a.id, (a.display_name as string) || "An author"]));
  return NextResponse.json({
    jobs: rows.map((r) => {
      const job = jobFromRow(r);
      const pid = job.projectId;
      return {
        ...job,
        // The invite token is only needed to answer an open invite
        inviteToken: job.status === "invited" ? (r.invite_token as string) : null,
        book: title.get(pid) || "Untitled",
        author: author.get(job.authorId) || "An author",
        chapters: (chapters.data || []).filter((c) => c.project_id === pid).length,
        recorded: new Set((takes.data || []).filter((t) => t.project_id === pid && t.chapter_id).map((t) => t.chapter_id)).size,
        approved: (approved.data || []).filter((a) => a.project_id === pid).length,
      };
    }),
  });
}

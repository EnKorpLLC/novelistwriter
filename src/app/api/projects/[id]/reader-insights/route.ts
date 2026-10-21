import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { normalizeReviewLinks, reviewSiteKey } from "@/lib/arc";
import {
  computeReaderInsights,
  type InsightInvite,
  type InsightsPhase,
} from "@/lib/reader-insights";

const PAGE = 1000;
const MAX_ROWS = 20000;

async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error || !data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

function readerName(row: { display_name: string | null; email: string }) {
  return row.display_name?.trim() || row.email.split("@")[0] || "Reader";
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const phase: InsightsPhase = new URL(req.url).searchParams.get("phase") === "arc" ? "arc" : "beta";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userHasStudio(user.id))) return NextResponse.json({ studioAccess: false });

  const admin = createServiceClient();
  const { data: chapters } = await admin
    .from("chapters")
    .select("id, title, sort_order, word_count")
    .eq("project_id", projectId)
    .order("sort_order");

  const days = await fetchAll<{ invite_id: string; day: string }>((from, to) =>
    admin
      .from("reader_book_days")
      .select("invite_id, day")
      .eq("project_id", projectId)
      .eq("phase", phase)
      .range(from, to)
  );

  if (phase === "beta") {
    const [{ data: invites }, progress, comments] = await Promise.all([
      admin
        .from("beta_invites")
        .select("id, email, display_name, status, created_at, last_read_at, finished_at, dnf_at, dnf_reason, current_chapter_id")
        .eq("project_id", projectId)
        .in("status", ["pending", "accepted", "dnf"]),
      fetchAll<{ invite_id: string; chapter_id: string; percent: number }>((from, to) =>
        admin
          .from("beta_reading_progress")
          .select("invite_id, chapter_id, percent")
          .eq("project_id", projectId)
          .range(from, to)
      ),
      fetchAll<{ invite_id: string; chapter_id: string | null }>((from, to) =>
        admin
          .from("beta_comments")
          .select("invite_id, chapter_id")
          .eq("project_id", projectId)
          .is("author_user_id", null)
          .not("invite_id", "is", null)
          .range(from, to)
      ),
    ]);
    const rows: InsightInvite[] = (invites || []).map((i) => ({
      id: i.id,
      name: readerName(i),
      status: i.status,
      createdAt: i.created_at,
      lastReadAt: i.last_read_at,
      finishedAt: i.finished_at,
      dnfAt: i.dnf_at,
      dnfReason: i.dnf_reason,
      currentChapterId: i.current_chapter_id,
    }));
    return NextResponse.json({
      studioAccess: true,
      insights: computeReaderInsights({ phase, chapters: chapters || [], invites: rows, progress, days, comments }),
    });
  }

  const [{ data: proj }, { data: invites }, progress] = await Promise.all([
    admin.from("projects").select("arc_deadline, arc_review_links").eq("id", projectId).maybeSingle(),
    admin
      .from("arc_invites")
      .select("id, email, display_name, status, created_at, last_read_at, finished_at, current_chapter_id, review_posts")
      .eq("project_id", projectId)
      .eq("status", "active"),
    fetchAll<{ invite_id: string; chapter_id: string; percent: number }>((from, to) =>
      admin
        .from("arc_reading_progress")
        .select("invite_id, chapter_id, percent")
        .eq("project_id", projectId)
        .range(from, to)
    ),
  ]);
  const rows: InsightInvite[] = (invites || []).map((i) => ({
    id: i.id,
    name: readerName(i),
    status: i.status,
    createdAt: i.created_at,
    lastReadAt: i.last_read_at,
    finishedAt: i.finished_at,
    currentChapterId: i.current_chapter_id,
    reviewPosts: (i.review_posts as Record<string, string>) || {},
  }));
  return NextResponse.json({
    studioAccess: true,
    insights: computeReaderInsights({
      phase,
      chapters: chapters || [],
      invites: rows,
      progress,
      days,
      comments: [],
      deadline: proj?.arc_deadline || null,
      reviewSites: normalizeReviewLinks(proj?.arc_review_links).map((l) => ({ key: reviewSiteKey(l), label: l.label })),
    }),
  });
}

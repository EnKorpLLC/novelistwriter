import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { notifyUser } from "@/lib/notifications";
import { REVIEWS_HINT, reviewEligibility, type ReviewSource } from "@/lib/book-reviews";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** ?projectId= : whether the signed-in reader can review this book (and how), and their review if they wrote one. */
export async function GET(req: Request) {
  const { user } = await me();
  const projectId = new URL(req.url).searchParams.get("projectId") || "";
  if (!user || !/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ sources: [], mine: null });
  const admin = createServiceClient();
  const [sources, { data: mine }] = await Promise.all([
    reviewEligibility(admin, user.id, user.email || null, projectId),
    admin.from("book_reviews").select("stars, body, source").eq("project_id", projectId).eq("reviewer_user_id", user.id).maybeSingle(),
  ]);
  return NextResponse.json({ sources, mine: mine || null });
}

/** Write or update your review: { projectId, stars, body, source? } (source defaults to the strongest one you have). */
export async function POST(req: Request) {
  const { user } = await me();
  if (!user) return NextResponse.json({ error: "Sign in to review." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { projectId?: string; stars?: number; body?: string; source?: string };
  const projectId = String(b.projectId || "");
  const stars = Math.round(Number(b.stars));
  if (!(stars >= 1 && stars <= 5)) return NextResponse.json({ error: "Pick from one to five stars." }, { status: 400 });
  const admin = createServiceClient();
  const { data: project } = await admin.from("projects").select("id, user_id, title").eq("id", projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  if (project.user_id === user.id) return NextResponse.json({ error: "You can't review your own book." }, { status: 400 });
  const sources = await reviewEligibility(admin, user.id, user.email || null, projectId);
  if (!sources.length) return NextResponse.json({ error: "Reviews here come from readers who bought the book here, or read it as an advance or beta reader." }, { status: 403 });
  const source = (sources.includes(b.source as ReviewSource) ? b.source : sources[0]) as ReviewSource;
  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const now = new Date().toISOString();
  const { data: before } = await admin.from("book_reviews").select("id").eq("project_id", projectId).eq("reviewer_user_id", user.id).maybeSingle();
  const { error } = await admin.from("book_reviews").upsert(
    {
      project_id: projectId,
      reviewer_user_id: user.id,
      reviewer_name: String(profile?.display_name || "").trim().slice(0, 60) || "A reader",
      source,
      stars,
      body: String(b.body || "").trim().slice(0, 4000),
      updated_at: now,
    },
    { onConflict: "project_id,reviewer_user_id" }
  );
  if (error) return NextResponse.json({ error: REVIEWS_HINT }, { status: 500 });
  if (!before) {
    await notifyUser(admin, project.user_id, {
      type: "reader_review",
      title: `New ${"★".repeat(stars)} review of ${project.title || "your book"}`,
      body: String(b.body || "").slice(0, 200) || "A reader rated your book.",
      href: `/project/${projectId}?tab=publish`,
    }).catch(() => null);
  }
  return NextResponse.json({ ok: true, source });
}

/**
 *   { id, action: "reply", body }   the author, once
 *   { id, action: "delete" }        the reviewer's own
 *   { id, action: "hide" | "show" } the platform admin
 */
export async function PATCH(req: Request) {
  const { supabase, user } = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string; body?: string };
  const admin = createServiceClient();
  const { data: r } = await admin.from("book_reviews").select("*").eq("id", String(b.id || "")).maybeSingle();
  if (!r) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  if (b.action === "reply") {
    const { data: project } = await admin.from("projects").select("user_id").eq("id", r.project_id).maybeSingle();
    if (project?.user_id !== user.id) return NextResponse.json({ error: "Only the author can reply." }, { status: 403 });
    if (r.author_reply) return NextResponse.json({ error: "You've already replied." }, { status: 400 });
    const body = String(b.body || "").trim().slice(0, 1000);
    if (!body) return NextResponse.json({ error: "Write your reply first." }, { status: 400 });
    await admin.from("book_reviews").update({ author_reply: body, replied_at: new Date().toISOString() }).eq("id", r.id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "delete") {
    if (r.reviewer_user_id !== user.id) return NextResponse.json({ error: "Only the reviewer can delete it." }, { status: 403 });
    await admin.from("book_reviews").delete().eq("id", r.id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "hide" || b.action === "show") {
    if (!(await isPlatformAdmin(supabase, user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await admin.from("book_reviews").update({ status: b.action === "hide" ? "hidden" : "published" }).eq("id", r.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

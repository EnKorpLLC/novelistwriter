import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { htmlToBlocks } from "@/lib/book/model";
import { renderBlocks } from "@/lib/book/render";
import { jobFor, milestonesOf } from "@/lib/market-jobs";
import { marketType } from "@/lib/market-types";

const NOTES_HINT = "Editor notes need a database update. Run supabase/migration_market_notes.sql in the Supabase SQL editor.";

async function load(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = createServiceClient();
  const found = await jobFor(admin, id, user.id);
  if (!found) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const { job, role } = found;
  if (marketType(job.market_type)?.group !== "editing" || !job.project_id) return { error: NextResponse.json({ error: "Notes are for editing jobs tied to a book." }, { status: 400 }) };
  // The editor reads the book once work has started (the first milestone is paid)
  const started = (await milestonesOf(admin, job.id)).some((m) => m.status !== "unpaid" && m.status !== "cancelled");
  return { user, admin, job, role, started };
}

/** The editor's notes, and (for the editor, once work has started) the chapters to read and note. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await load(id);
  if ("error" in l) return l.error;
  const chapterId = new URL(req.url).searchParams.get("chapterId");
  const [{ data: chapters }, { data: notes, error }] = await Promise.all([
    l.admin.from("chapters").select("id, title, sort_order, content_html, content_text").eq("project_id", l.job.project_id).order("sort_order"),
    l.admin.from("market_notes").select("*").eq("job_id", l.job.id).order("created_at"),
  ]);
  if (error) return NextResponse.json({ migrationNeeded: true, error: NOTES_HINT });
  const list = chapters || [];
  const open = l.role === "pro" && l.started ? list.find((c) => c.id === chapterId) || list[0] : null;
  return NextResponse.json({
    role: l.role,
    canNote: l.role === "pro" && l.started && ["agreed", "disputed"].includes(l.job.status),
    chapters: list.map((c, i) => ({ id: c.id, title: c.title || `Chapter ${i + 1}`, notes: (notes || []).filter((n) => n.chapter_id === c.id).length })),
    chapter: open
      ? { id: open.id, title: open.title || "Chapter", html: renderBlocks(htmlToBlocks(open.content_html, open.content_text), { opening: "none", ornament: "* * *" }) }
      : null,
    notes: (notes || []).map((n) => ({ id: n.id, chapterId: n.chapter_id, excerpt: n.excerpt, body: n.body, resolved: Boolean(n.resolved_at), at: n.created_at })),
  });
}

/** Editor: { action: "add", chapterId, excerpt, body } · { action: "delete", noteId }. Author: { action: "resolve", noteId, resolved }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await load(id);
  if ("error" in l) return l.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action === "add" && l.role === "pro") {
    if (!l.started || !["agreed", "disputed"].includes(l.job.status)) return NextResponse.json({ error: "Notes open once the first milestone is paid." }, { status: 400 });
    const body = String(b.body || "").trim().slice(0, 3000);
    if (!body) return NextResponse.json({ error: "Write the note first." }, { status: 400 });
    const { data: ch } = await l.admin.from("chapters").select("id").eq("id", String(b.chapterId || "")).eq("project_id", l.job.project_id).maybeSingle();
    if (!ch) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    const { error } = await l.admin.from("market_notes").insert({ job_id: l.job.id, chapter_id: ch.id, author_id: l.user.id, excerpt: String(b.excerpt || "").trim().slice(0, 500), body });
    if (error) return NextResponse.json({ error: NOTES_HINT }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "delete" && l.role === "pro") {
    await l.admin.from("market_notes").delete().eq("id", String(b.noteId || "")).eq("job_id", l.job.id).eq("author_id", l.user.id).is("resolved_at", null);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "resolve" && l.role === "author") {
    await l.admin.from("market_notes").update({ resolved_at: b.resolved === false ? null : new Date().toISOString() }).eq("id", String(b.noteId || "")).eq("job_id", l.job.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "That isn't something you can do here." }, { status: 400 });
}

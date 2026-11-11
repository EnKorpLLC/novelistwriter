import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { signedDownloadUrl } from "@/lib/r2";
import { jobFor } from "@/lib/market-jobs";
import { marketType } from "@/lib/market-types";
import { applyToChapter, basisOf, countWords, reviewEdits } from "@/lib/market-edits";

export const maxDuration = 60;

async function load(jobId: string, fileId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = createServiceClient();
  const found = await jobFor(admin, jobId, user.id);
  if (!found || found.role !== "author") return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const { job } = found;
  if (marketType(job.market_type)?.group !== "editing" || !job.project_id) return { error: NextResponse.json({ error: "This job isn't tied to a book." }, { status: 400 }) };
  const { data: file } = await admin.from("market_files").select("*").eq("id", fileId).eq("job_id", job.id).is("deleted_at", null).maybeSingle();
  if (!file || !/\.docx$/i.test(file.name as string)) return { error: NextResponse.json({ error: "That isn't a Word file from this job." }, { status: 404 }) };
  const res = await fetch(await signedDownloadUrl(file.r2_key as string, 300));
  if (!res.ok) return { error: NextResponse.json({ error: "Couldn't open the file. Try again." }, { status: 502 }) };
  const buf = Buffer.from(await res.arrayBuffer());
  const { data: chapters } = await admin.from("chapters").select("id, title, sort_order, content_html, user_id").eq("project_id", job.project_id).order("sort_order");
  const review = await reviewEdits(buf, chapters || []);
  return { user, admin, job, file, chapters: chapters || [], review, basis: basisOf(chapters || []) };
}

/** Every changed paragraph in the editor's file, against the book as it is now. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const l = await load(id, fileId);
  if ("error" in l) return l.error;
  return NextResponse.json({ fileName: l.file.name, jobTitle: l.job.title, basis: l.basis, chapters: l.review });
}

/** { basis, accept: [changeId] }: saves a version of the book first, then applies only the accepted changes. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const l = await load(id, fileId);
  if ("error" in l) return l.error;
  const b = (await req.json().catch(() => ({}))) as { basis?: string; accept?: string[] };
  if (b.basis !== l.basis) return NextResponse.json({ error: "The book changed since you opened this. Reload to see the changes against the latest text." }, { status: 409 });
  const accept = new Set((b.accept || []).map(String));
  const all = l.review.flatMap((c) => c.changes);
  const chosen = l.review.map((c) => ({ chapterId: c.chapterId, changes: c.changes.filter((x) => accept.has(x.id)) })).filter((c) => c.changes.length);
  if (!chosen.length) return NextResponse.json({ error: "Accept at least one change, or close this page to keep the book as it is." }, { status: 400 });

  const now = new Date().toISOString();
  const label = `Before editor changes: ${l.job.title}`.slice(0, 200);
  const touched = l.chapters.filter((c) => chosen.some((x) => x.chapterId === c.id));
  const { data: full } = await l.admin.from("chapters").select("*").in("id", touched.map((c) => c.id));
  const { error: snapErr } = await l.admin.from("chapter_versions").insert(
    (full || []).map((c) => ({ chapter_id: c.id, user_id: c.user_id, content_html: c.content_html, content_text: c.content_text, word_count: c.word_count, label }))
  );
  if (snapErr) return NextResponse.json({ error: "Couldn't save a version of the book first, so nothing was changed. Try again." }, { status: 500 });

  let wordsChanged = 0;
  for (const c of chosen) {
    const ch = l.chapters.find((x) => x.id === c.chapterId)!;
    const out = applyToChapter(ch.content_html || "", c.changes);
    wordsChanged += out.wordsChanged;
    await l.admin.from("chapters").update({ content_html: out.html, content_text: out.text, word_count: countWords(out.html), updated_at: now }).eq("id", ch.id);
  }
  const accepted = chosen.reduce((n, c) => n + c.changes.length, 0);
  await l.admin
    .from("market_edit_log")
    .insert({ job_id: l.job.id, project_id: l.job.project_id, file_id: fileId, accepted, rejected: all.length - accepted, words_changed: wordsChanged })
    .then(() => null, () => null);
  await l.admin.from("market_messages").insert({ job_id: l.job.id, sender_id: l.user.id, body: `Accepted ${accepted} of ${all.length} changes from ${l.file.name} into the book.` });
  return NextResponse.json({ ok: true, accepted, rejected: all.length - accepted, label });
}

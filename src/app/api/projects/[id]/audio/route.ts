import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { audioAccess } from "@/lib/narration-access";
import { deleteObject, objectSize, r2Configured, signedUploadUrl } from "@/lib/r2";
import { REVIEW_MAX_BYTES, latestReviewCopies, removeChapterCopies, reviewKey } from "@/lib/review-copies";
import { renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/stripe";

const HINT = "Database needs an update. Run supabase/migration_audiobook.sql in the Supabase SQL editor.";
const REVIEW_HINT = "Review and pickups need a database update. Run supabase/migration_audiobook_review.sql in the Supabase SQL editor.";
const EXPORT_HINT = "Credits and export settings need a database update. Run supabase/migration_audiobook_export.sql in the Supabase SQL editor.";
const COPIES_HINT = "Review copies need a database update. Run supabase/migration_review_copies.sql in the Supabase SQL editor.";
const STATUSES = ["recording", "review", "approved"] as const;
/** Opening and closing credits are recorded like chapters but aren't chapters. */
const SEGMENTS = ["opening", "closing"] as const;
type Segment = (typeof SEGMENTS)[number];
const segmentOf = (v: unknown) => SEGMENTS.find((s) => s === v) as Segment | undefined;

export type AudioSettings = { narrator: string; sampleChapterId: string | null; sampleSentence: number };
function normalizeSettings(raw: unknown): AudioSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    narrator: typeof r.narrator === "string" ? r.narrator.slice(0, 120) : "",
    sampleChapterId: typeof r.sampleChapterId === "string" ? r.sampleChapterId : null,
    sampleSentence: Number.isFinite(Number(r.sampleSentence)) ? Math.max(0, Math.round(Number(r.sampleSentence))) : 0,
  };
}

/** Takes per chapter and the narration record so far. Audio itself never comes here. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await audioAccess(id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { studio, role, job, authorId } = access;
  const admin = createServiceClient();
  const [takes, sessions, notes, chapters, settings, profile, copies] = await Promise.all([
    admin.from("audio_takes").select("*").eq("project_id", id).order("take_no"),
    admin.from("narration_sessions").select("id, started_at, ended_at, recorded_ms, takes, noise_floor_db").eq("project_id", id).order("started_at"),
    admin.from("audio_notes").select("*").eq("project_id", id).order("sentence"),
    admin.from("audio_chapters").select("chapter_id, status, rounds, approved_at").eq("project_id", id),
    admin.from("projects").select("audio_settings").eq("id", id).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", authorId).maybeSingle(),
    latestReviewCopies(admin, id).catch(() => null),
  ]);
  if (takes.error || sessions.error) return NextResponse.json({ studio, migrationNeeded: true, error: HINT, takes: [], record: null });
  const reviewReady = !notes.error && !chapters.error;
  const rows = takes.data || [];
  const recorded = rows.filter((t) => !t.imported);
  const chaptersRecorded = new Set(recorded.map((t) => t.chapter_id ?? t.segment)).size;
  return NextResponse.json({
    studio,
    role,
    userId: access.user.id,
    narrator: job
      ? { name: job.narratorName, jobId: job.id, checkpoint: { required: job.terms.checkpoint, status: job.checkpointStatus, note: job.checkpointNote } }
      : null,
    reviewCopies: copies || {},
    reviewCopiesHint: job && copies === null ? COPIES_HINT : null,
    storageReady: r2Configured(),
    exportHint: settings.error ? EXPORT_HINT : null,
    settings: normalizeSettings(settings.data?.audio_settings),
    authorName: (profile.data?.display_name as string) || "",
    takes: rows.map((t) => ({
      id: t.id,
      chapterId: t.chapter_id ?? t.segment,
      takeNo: t.take_no,
      fileName: t.file_name,
      fromSentence: t.from_sentence,
      toSentence: t.to_sentence ?? null,
      parentId: t.parent_take_id ?? null,
      inMs: t.splice_in_ms ?? null,
      outMs: t.splice_out_ms ?? null,
      noteId: t.note_id ?? null,
      durationMs: t.duration_ms,
      peakDb: t.peak_db,
      rmsDb: t.rms_db,
      chosen: t.chosen,
      imported: t.imported,
      createdAt: t.created_at,
      recordedBy: t.user_id,
    })),
    reviewHint: reviewReady ? null : REVIEW_HINT,
    notes: (notes.data || []).map((n) => ({
      id: n.id,
      chapterId: n.chapter_id,
      sentence: n.sentence,
      toSentence: n.to_sentence,
      quote: n.quote,
      body: n.body,
      atMs: n.at_ms,
      status: n.status,
      pickupTakeId: n.pickup_take_id,
      createdAt: n.created_at,
    })),
    chapters: Object.fromEntries((chapters.data || []).map((c) => [c.chapter_id, { status: c.status, rounds: c.rounds, approvedAt: c.approved_at }])),
    record: {
      sessions: (sessions.data || []).filter((s) => s.recorded_ms > 0).length,
      recordedMs: recorded.reduce((n, t) => n + t.duration_ms, 0),
      takes: recorded.length,
      // Every take after a chapter's first is a retake or pickup
      retakes: Math.max(0, recorded.length - chaptersRecorded),
      firstAt: sessions.data?.[0]?.started_at || null,
      lastAt: sessions.data?.[sessions.data.length - 1]?.ended_at || sessions.data?.[sessions.data.length - 1]?.started_at || null,
    },
  });
}

/**
 *   { action: "start_session", noiseFloorDb?, roomToneFile? } → { id }
 *   { action: "end_session", id }
 *   { action: "add_take", chapterId, sessionId, takeNo, fileName, fromSentence, toSentence?, noteId?, durationMs, sampleRate, peakDb, rmsDb }
 *   { action: "choose_take", id }   (one chosen take per chapter and sentence range)
 *   { action: "place_take", id, parentId, inMs, outMs }   (where a pickup cuts into its parent take)
 *   { action: "delete_take", id }
 *   { action: "add_note", chapterId, sentence, toSentence, quote, body, atMs? }
 *   { action: "update_note", id, status?, body? }   { action: "delete_note", id }
 *   { action: "chapter_status", chapterId, status: recording | review | approved }
 *   { action: "settings", settings: { narrator, sampleChapterId, sampleSentence } }
 * chapterId "opening" or "closing" records the credits.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await audioAccess(id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.studio) return NextResponse.json({ error: "The audiobook studio is part of Studio." }, { status: 402 });
  const { user, role } = access;
  const admin = createServiceClient();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Narrators record, fix, and send chapters for review; notes, approval, and book settings are the author's
  if (role === "narrator") {
    const authorOnly = ["add_note", "update_note", "delete_note", "settings", "checkpoint"];
    if (authorOnly.includes(String(b.action)) || (b.action === "chapter_status" && b.status !== "review")) {
      return NextResponse.json({ error: "Only the author can do that." }, { status: 403 });
    }
  }
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

  if (b.action === "start_session") {
    const { data, error } = await admin
      .from("narration_sessions")
      .insert({ project_id: id, user_id: user.id, noise_floor_db: b.noiseFloorDb == null ? null : num(b.noiseFloorDb), room_tone_file: typeof b.roomToneFile === "string" ? b.roomToneFile.slice(0, 200) : null })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: HINT }, { status: 500 });
    return NextResponse.json({ id: data.id });
  }

  if (b.action === "end_session") {
    // Totals come from the takes themselves, so a closed tab can't inflate the record
    const sid = String(b.id || "");
    const { data: takes } = await admin.from("audio_takes").select("duration_ms").eq("session_id", sid).eq("user_id", user.id);
    await admin
      .from("narration_sessions")
      .update({ ended_at: new Date().toISOString(), recorded_ms: (takes || []).reduce((n, t) => n + t.duration_ms, 0), takes: (takes || []).length })
      .eq("id", sid)
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  }

  const chapterOf = async (chapterId: unknown) => {
    const { data } = await admin.from("chapters").select("id").eq("id", String(chapterId || "")).eq("project_id", id).maybeSingle();
    return data?.id as string | undefined;
  };
  const optInt = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.round(Number(v))));

  // A slot is a chapter id, or "opening" / "closing" for the credits
  const slotColumn = (slot: string) => (segmentOf(slot) ? "segment" : "chapter_id");

  // One chosen take per slot and sentence range: the whole chapter, or each pickup's lines
  async function choose(takeId: string, slot: string, from: number, to: number | null) {
    let q = admin.from("audio_takes").update({ chosen: false }).eq("project_id", id).eq(slotColumn(slot), slot).eq("from_sentence", from).neq("id", takeId);
    q = to == null ? q.is("to_sentence", null) : q.eq("to_sentence", to);
    const { error } = await q;
    // Before the review migration there's no to_sentence; fall back to the starting sentence alone
    if (error) await admin.from("audio_takes").update({ chosen: false }).eq("project_id", id).eq(slotColumn(slot), slot).eq("from_sentence", from).neq("id", takeId);
    await admin.from("audio_takes").update({ chosen: true }).eq("id", takeId);
  }

  if (b.action === "settings") {
    const { error } = await admin.from("projects").update({ audio_settings: normalizeSettings(b.settings) }).eq("id", id);
    if (error) return NextResponse.json({ error: EXPORT_HINT }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "add_take") {
    const segment = segmentOf(b.chapterId);
    const chapterId = segment ? null : await chapterOf(b.chapterId);
    if (!segment && !chapterId) return NextResponse.json({ error: "Chapter not found" }, { status: 400 });
    const from = Math.max(0, Math.round(num(b.fromSentence)));
    const to = optInt(b.toSentence);
    const row = {
      project_id: id,
      chapter_id: chapterId,
      ...(segment ? { segment } : {}),
      user_id: user.id,
      session_id: typeof b.sessionId === "string" ? b.sessionId : null,
      take_no: Math.max(1, Math.round(num(b.takeNo, 1))),
      file_name: String(b.fileName || "").slice(0, 200),
      from_sentence: from,
      duration_ms: Math.max(0, Math.round(num(b.durationMs))),
      sample_rate: Math.round(num(b.sampleRate, 48000)),
      peak_db: num(b.peakDb, -120),
      rms_db: num(b.rmsDb, -120),
    };
    const noteId = typeof b.noteId === "string" ? b.noteId : null;
    let ins = await admin
      .from("audio_takes")
      .insert({ ...row, to_sentence: to == null ? null : Math.max(from, to), note_id: noteId })
      .select("id")
      .single();
    if (ins.error) ins = await admin.from("audio_takes").insert(row).select("id").single();
    if (ins.error || !ins.data) return NextResponse.json({ error: segment ? EXPORT_HINT : HINT }, { status: 500 });
    // The newest take for a range is the chosen one until the narrator picks another
    await choose(ins.data.id, segment || chapterId!, from, to == null ? null : Math.max(from, to));
    if (noteId) await admin.from("audio_notes").update({ status: "fixed", pickup_take_id: ins.data.id, resolved_at: new Date().toISOString() }).eq("id", noteId).eq("project_id", id);
    return NextResponse.json({ id: ins.data.id });
  }

  if (b.action === "add_note") {
    const chapterId = await chapterOf(b.chapterId);
    if (!chapterId) return NextResponse.json({ error: "Chapter not found" }, { status: 400 });
    const sentence = Math.max(0, Math.round(num(b.sentence)));
    const body = String(b.body || "").trim().slice(0, 1000);
    if (!body) return NextResponse.json({ error: "Write what to fix" }, { status: 400 });
    const { data, error } = await admin
      .from("audio_notes")
      .insert({
        project_id: id,
        chapter_id: chapterId,
        user_id: user.id,
        sentence,
        to_sentence: Math.max(sentence, optInt(b.toSentence) ?? sentence),
        quote: String(b.quote || "").slice(0, 500),
        body,
        at_ms: optInt(b.atMs),
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: REVIEW_HINT }, { status: 500 });
    return NextResponse.json({ id: data.id });
  }

  if (b.action === "update_note" || b.action === "delete_note") {
    const noteId = String(b.id || "");
    if (b.action === "delete_note") {
      await admin.from("audio_notes").delete().eq("id", noteId).eq("project_id", id);
      return NextResponse.json({ ok: true });
    }
    const patch: Record<string, unknown> = {};
    if (typeof b.body === "string" && b.body.trim()) patch.body = b.body.trim().slice(0, 1000);
    if (typeof b.status === "string" && ["open", "fixed", "dismissed"].includes(b.status)) {
      patch.status = b.status;
      patch.resolved_at = b.status === "open" ? null : new Date().toISOString();
      if (b.status === "open") patch.pickup_take_id = null;
    }
    await admin.from("audio_notes").update(patch).eq("id", noteId).eq("project_id", id);
    return NextResponse.json({ ok: true });
  }

  const { job } = access;
  // Tell the other side of a narrator job, by email
  async function tell(to: "author" | "narrator", subject: string, paragraphs: string[], path: string) {
    if (!job) return;
    const uid = to === "author" ? job.authorId : job.narratorId;
    if (!uid) return;
    const { data: p } = await admin.from("profiles").select("email").eq("id", uid).maybeSingle();
    if (!p?.email) return;
    const mail = renderEmail({ heading: subject, paragraphs, button: { label: to === "author" ? "Open the Audio tab" : "Open the studio", url: appUrl(path) } });
    await sendEmail({ to: p.email as string, subject, text: mail.text, html: mail.html }).catch(() => null);
  }
  const chapterTitle = async (chapterId: string) => {
    const { data } = await admin.from("chapters").select("title, sort_order").eq("id", chapterId).maybeSingle();
    return (data?.title as string)?.trim() || `Chapter ${(Number(data?.sort_order) || 0) + 1}`;
  };

  // Review copies go straight from the narrator's browser to R2; the link only allows this one file
  if (b.action === "review_upload_url") {
    if (!r2Configured()) return NextResponse.json({ error: "Audio storage isn't set up yet." }, { status: 503 });
    const chapterId = await chapterOf(b.chapterId);
    if (!chapterId) return NextResponse.json({ error: "Chapter not found" }, { status: 400 });
    const key = reviewKey(id, chapterId);
    return NextResponse.json({ key, url: await signedUploadUrl(key, 1800) });
  }

  if (b.action === "review_uploaded") {
    const chapterId = await chapterOf(b.chapterId);
    const key = String(b.key || "");
    if (!chapterId || !key.startsWith(`review/${id}/${chapterId}/`)) return NextResponse.json({ error: "That upload doesn't belong to this chapter." }, { status: 400 });
    const bytes = await objectSize(key).catch(() => null);
    if (bytes == null) return NextResponse.json({ error: "The upload didn't arrive. Try sending it again." }, { status: 400 });
    if (bytes > REVIEW_MAX_BYTES) {
      await deleteObject(key).catch(() => null);
      return NextResponse.json({ error: "That review copy is too large." }, { status: 400 });
    }
    const checkpoint = Boolean(role === "narrator" && job?.terms.checkpoint && (job.checkpointStatus === "pending" || job.checkpointStatus === "changes"));
    const cuts = (Array.isArray(b.cuts) ? b.cuts : []).slice(0, 5000).map((c) => Math.max(0, Math.round(Number(c) || 0)));
    const { data: copy, error } = await admin
      .from("audio_review_copies")
      .insert({ project_id: id, chapter_id: chapterId, user_id: user.id, r2_key: key, bytes, duration_ms: Math.max(0, Math.round(num(b.durationMs))), cuts, is_checkpoint: checkpoint })
      .select("id")
      .single();
    if (error || !copy) {
      await deleteObject(key).catch(() => null);
      return NextResponse.json({ error: COPIES_HINT }, { status: 500 });
    }
    // One current copy per chapter
    await removeChapterCopies(admin, chapterId, copy.id);
    const { data: before } = await admin.from("audio_chapters").select("rounds").eq("chapter_id", chapterId).maybeSingle();
    await admin.from("audio_chapters").upsert({ chapter_id: chapterId, project_id: id, status: "review", rounds: before?.rounds || 0, approved_at: null, updated_at: new Date().toISOString() });
    if (checkpoint && job) {
      await admin.from("narrator_jobs").update({ checkpoint_status: "submitted", checkpoint_copy_id: copy.id, checkpoint_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    }
    const title = await chapterTitle(chapterId);
    await tell(
      "author",
      checkpoint ? `Checkpoint ready: ${job?.narratorName || "your narrator"} sent "${title}"` : `"${title}" is ready for review`,
      [
        checkpoint
          ? `${job?.narratorName || "Your narrator"} recorded their checkpoint. Listen in the Audio tab (Review), pin notes to any lines, then approve it or ask for changes before full production.`
          : `${job?.narratorName || "Your narrator"} sent "${title}" for review. Listen with the text alongside and pin notes to any lines that need another go.`,
        "The review copy is kept for 30 days or until you approve the chapter.",
      ],
      `/project/${id}?tab=audio`
    );
    return NextResponse.json({ ok: true, id: copy.id, checkpoint });
  }

  if (b.action === "checkpoint") {
    if (!job) return NextResponse.json({ error: "There's no narrator job on this book." }, { status: 400 });
    const approve = b.decision === "approve";
    const note = String(b.note || "").trim().slice(0, 1000);
    const { error } = await admin
      .from("narrator_jobs")
      .update({ checkpoint_status: approve ? "approved" : "changes", checkpoint_note: approve ? null : note || null, checkpoint_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", job.id);
    if (error) return NextResponse.json({ error: COPIES_HINT }, { status: 500 });
    await tell(
      "narrator",
      approve ? "Checkpoint approved: start full production" : "Checkpoint: the author asked for changes",
      approve
        ? ["The author approved your checkpoint. You're clear to record the rest of the book.", "Payments: the held deposit is collected at this step once payments open in an upcoming update."]
        : ["The author listened to your checkpoint and asked for some changes before full production.", note ? `Their note: "${note}"` : "See their notes in the studio's Review view."],
      `/narrator/book/${job.id}`
    );
    return NextResponse.json({ ok: true });
  }

  if (b.action === "chapter_status") {
    const chapterId = await chapterOf(b.chapterId);
    const status = STATUSES.find((s) => s === b.status);
    if (!chapterId || !status) return NextResponse.json({ error: "Unknown chapter or status" }, { status: 400 });
    const { data: before } = await admin.from("audio_chapters").select("status, rounds").eq("chapter_id", chapterId).maybeSingle();
    // Sent back after a review: that's another revision round
    const rounds = (before?.rounds || 0) + (before?.status === "review" && status === "recording" ? 1 : 0);
    const { error } = await admin.from("audio_chapters").upsert({
      chapter_id: chapterId,
      project_id: id,
      status,
      rounds,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: REVIEW_HINT }, { status: 500 });
    // Approved chapters don't need their review copy any more
    if (status === "approved") await removeChapterCopies(admin, chapterId).catch(() => 0);
    if (job && role === "owner" && status === "approved") {
      await tell("narrator", `"${await chapterTitle(chapterId)}" was approved`, ["The author approved this chapter."], `/narrator/book/${job.id}`);
    }
    if (job && role === "owner" && status === "recording" && before?.status === "review") {
      await tell("narrator", `Pickups needed: "${await chapterTitle(chapterId)}"`, ["The author pinned notes to some lines in this chapter. Open Review in the studio to see them and record the pickups."], `/narrator/book/${job.id}`);
    }
    return NextResponse.json({ ok: true, rounds });
  }

  const takeId = String(b.id || "");
  const { data: take } = await admin.from("audio_takes").select("*").eq("id", takeId).eq("project_id", id).maybeSingle();
  if (!take) return NextResponse.json({ error: "Take not found" }, { status: 404 });
  // A take's file lives on the computer of whoever recorded it, so only they can place or delete it
  if (take.user_id !== user.id && (b.action === "delete_take" || b.action === "place_take" || role === "narrator")) {
    return NextResponse.json({ error: "That take was recorded by someone else." }, { status: 403 });
  }
  const slot = (take.chapter_id ?? take.segment) as string;
  if (b.action === "choose_take") {
    await choose(take.id, slot, take.from_sentence, take.to_sentence ?? null);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "place_take") {
    // Where this pickup cuts into its parent take, worked out (and adjustable) in the narrator's browser
    const parentId = String(b.parentId || "");
    const { data: parent } = await admin.from("audio_takes").select("id").eq("id", parentId).eq("project_id", id).eq(slotColumn(slot), slot).maybeSingle();
    if (!parent || parent.id === take.id) return NextResponse.json({ error: "Parent take not found" }, { status: 400 });
    const inMs = optInt(b.inMs);
    const outMs = optInt(b.outMs);
    if (inMs == null || (outMs != null && outMs <= inMs)) return NextResponse.json({ error: "Splice points don't make sense" }, { status: 400 });
    const { error } = await admin.from("audio_takes").update({ parent_take_id: parent.id, splice_in_ms: inMs, splice_out_ms: outMs }).eq("id", take.id);
    if (error) return NextResponse.json({ error: REVIEW_HINT }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "delete_take") {
    // A note this take fixed needs fixing again
    await admin.from("audio_notes").update({ status: "open", pickup_take_id: null, resolved_at: null }).eq("pickup_take_id", take.id);
    await admin.from("audio_takes").delete().eq("id", take.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

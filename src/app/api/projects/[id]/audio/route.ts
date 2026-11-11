import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";

const HINT = "Database needs an update. Run supabase/migration_audiobook.sql in the Supabase SQL editor.";
const REVIEW_HINT = "Review and pickups need a database update. Run supabase/migration_audiobook_review.sql in the Supabase SQL editor.";
const STATUSES = ["recording", "review", "approved"] as const;

async function owner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return data ? user : null;
}

/** Takes per chapter and the narration record so far. Audio itself never comes here. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await owner(id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const [studio, takes, sessions, notes, chapters] = await Promise.all([
    userHasStudio(user.id),
    admin.from("audio_takes").select("*").eq("project_id", id).order("take_no"),
    admin.from("narration_sessions").select("id, started_at, ended_at, recorded_ms, takes, noise_floor_db").eq("project_id", id).order("started_at"),
    admin.from("audio_notes").select("*").eq("project_id", id).order("sentence"),
    admin.from("audio_chapters").select("chapter_id, status, rounds, approved_at").eq("project_id", id),
  ]);
  if (takes.error || sessions.error) return NextResponse.json({ studio, migrationNeeded: true, error: HINT, takes: [], record: null });
  const reviewReady = !notes.error && !chapters.error;
  const rows = takes.data || [];
  const recorded = rows.filter((t) => !t.imported);
  const chaptersRecorded = new Set(recorded.map((t) => t.chapter_id)).size;
  return NextResponse.json({
    studio,
    takes: rows.map((t) => ({
      id: t.id,
      chapterId: t.chapter_id,
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
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await owner(id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userHasStudio(user.id))) return NextResponse.json({ error: "The audiobook studio is part of Studio." }, { status: 402 });
  const admin = createServiceClient();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
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

  // One chosen take per chapter and sentence range: the whole chapter, or each pickup's lines
  async function choose(takeId: string, chapterId: string, from: number, to: number | null) {
    let q = admin.from("audio_takes").update({ chosen: false }).eq("chapter_id", chapterId).eq("from_sentence", from).neq("id", takeId);
    q = to == null ? q.is("to_sentence", null) : q.eq("to_sentence", to);
    const { error } = await q;
    // Before the review migration there's no to_sentence; fall back to the starting sentence alone
    if (error) await admin.from("audio_takes").update({ chosen: false }).eq("chapter_id", chapterId).eq("from_sentence", from).neq("id", takeId);
    await admin.from("audio_takes").update({ chosen: true }).eq("id", takeId);
  }

  if (b.action === "add_take") {
    const chapterId = await chapterOf(b.chapterId);
    if (!chapterId) return NextResponse.json({ error: "Chapter not found" }, { status: 400 });
    const from = Math.max(0, Math.round(num(b.fromSentence)));
    const to = optInt(b.toSentence);
    const row = {
      project_id: id,
      chapter_id: chapterId,
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
    if (ins.error || !ins.data) return NextResponse.json({ error: HINT }, { status: 500 });
    // The newest take for a range is the chosen one until the narrator picks another
    await choose(ins.data.id, chapterId, from, to == null ? null : Math.max(from, to));
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
    return NextResponse.json({ ok: true, rounds });
  }

  const takeId = String(b.id || "");
  const { data: take } = await admin.from("audio_takes").select("*").eq("id", takeId).eq("project_id", id).maybeSingle();
  if (!take) return NextResponse.json({ error: "Take not found" }, { status: 404 });
  if (b.action === "choose_take") {
    await choose(take.id, take.chapter_id, take.from_sentence, take.to_sentence ?? null);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "place_take") {
    // Where this pickup cuts into its parent take, worked out (and adjustable) in the narrator's browser
    const parentId = String(b.parentId || "");
    const { data: parent } = await admin.from("audio_takes").select("id").eq("id", parentId).eq("chapter_id", take.chapter_id).maybeSingle();
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

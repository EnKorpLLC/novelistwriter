import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";

const HINT = "Database needs an update. Run supabase/migration_audiobook.sql in the Supabase SQL editor.";

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
  const [studio, takes, sessions] = await Promise.all([
    userHasStudio(user.id),
    admin.from("audio_takes").select("*").eq("project_id", id).order("take_no"),
    admin.from("narration_sessions").select("id, started_at, ended_at, recorded_ms, takes, noise_floor_db").eq("project_id", id).order("started_at"),
  ]);
  if (takes.error || sessions.error) return NextResponse.json({ studio, migrationNeeded: true, error: HINT, takes: [], record: null });
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
      durationMs: t.duration_ms,
      peakDb: t.peak_db,
      rmsDb: t.rms_db,
      chosen: t.chosen,
      imported: t.imported,
      createdAt: t.created_at,
    })),
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
 *   { action: "add_take", chapterId, sessionId, takeNo, fileName, fromSentence, durationMs, sampleRate, peakDb, rmsDb }
 *   { action: "choose_take", id }   (one chosen take per chapter and starting sentence)
 *   { action: "delete_take", id }
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

  if (b.action === "add_take") {
    const chapterId = String(b.chapterId || "");
    const { data: chapter } = await admin.from("chapters").select("id").eq("id", chapterId).eq("project_id", id).maybeSingle();
    if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 400 });
    const { data, error } = await admin
      .from("audio_takes")
      .insert({
        project_id: id,
        chapter_id: chapterId,
        user_id: user.id,
        session_id: typeof b.sessionId === "string" ? b.sessionId : null,
        take_no: Math.max(1, Math.round(num(b.takeNo, 1))),
        file_name: String(b.fileName || "").slice(0, 200),
        from_sentence: Math.max(0, Math.round(num(b.fromSentence))),
        duration_ms: Math.max(0, Math.round(num(b.durationMs))),
        sample_rate: Math.round(num(b.sampleRate, 48000)),
        peak_db: num(b.peakDb, -120),
        rms_db: num(b.rmsDb, -120),
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: HINT }, { status: 500 });
    // The newest take for a starting point is the chosen one until the narrator picks another
    await admin.from("audio_takes").update({ chosen: false }).eq("chapter_id", chapterId).eq("from_sentence", Math.max(0, Math.round(num(b.fromSentence)))).neq("id", data.id);
    await admin.from("audio_takes").update({ chosen: true }).eq("id", data.id);
    return NextResponse.json({ id: data.id });
  }

  const takeId = String(b.id || "");
  const { data: take } = await admin.from("audio_takes").select("id, chapter_id, from_sentence").eq("id", takeId).eq("project_id", id).maybeSingle();
  if (!take) return NextResponse.json({ error: "Take not found" }, { status: 404 });
  if (b.action === "choose_take") {
    await admin.from("audio_takes").update({ chosen: false }).eq("chapter_id", take.chapter_id).eq("from_sentence", take.from_sentence);
    await admin.from("audio_takes").update({ chosen: true }).eq("id", take.id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "delete_take") {
    await admin.from("audio_takes").delete().eq("id", take.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

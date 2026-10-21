import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { rewardAuthorSignup } from "@/lib/pass-rewards";

/** Typing faster than this for a whole session isn't human (about 300 words per minute). */
const MAX_TYPED_CHARS_PER_MINUTE = 1500;
const MAX_CHARS = 2_000_000;

function count(raw: unknown) {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_CHARS, n)) : 0;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const projectId = String(body.projectId || "");
  const chapterId = String(body.chapterId || "");
  const sessionKey = String(body.sessionKey || "").slice(0, 64);
  const startedAt = new Date(String(body.startedAt || ""));
  const endedAt = new Date(String(body.endedAt || ""));
  if (!projectId || !chapterId || !sessionKey) {
    return NextResponse.json({ error: "projectId, chapterId, sessionKey required" }, { status: 400 });
  }
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) || endedAt < startedAt) {
    return NextResponse.json({ error: "Invalid session times" }, { status: 400 });
  }
  // Session clocks come from the browser; refuse anything claiming to be in the future
  if (endedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return NextResponse.json({ error: "Invalid session times" }, { status: 400 });
  }

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id")
    .eq("id", chapterId)
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!chapter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const typed = count(body.typed);
  const pasted = count(body.pasted);
  const deleted = count(body.deleted);
  const minutes = Math.max(1, (endedAt.getTime() - startedAt.getTime()) / 60000);
  const flagged = typed / minutes > MAX_TYPED_CHARS_PER_MINUTE;

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("writing_sessions")
    .select("id, typed_chars, pasted_chars, deleted_chars, started_at, flagged")
    .eq("user_id", user.id)
    .eq("session_key", sessionKey)
    .maybeSingle();

  // Totals are cumulative; a late or out-of-order send must never shrink them
  const row = {
    user_id: user.id,
    project_id: projectId,
    chapter_id: chapterId,
    session_key: sessionKey,
    started_at: existing?.started_at || startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    typed_chars: Math.max(typed, existing?.typed_chars || 0),
    pasted_chars: Math.max(pasted, existing?.pasted_chars || 0),
    deleted_chars: Math.max(deleted, existing?.deleted_chars || 0),
    flagged: flagged || Boolean(existing?.flagged),
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("writing_sessions")
    .upsert(row, { onConflict: "user_id,session_key" });
  if (error) {
    const hint = error.message.includes("writing_sessions")
      ? "Database needs an update. Run supabase/migration_proof_trust.sql in the Supabase SQL editor."
      : error.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  await rewardAuthorSignup(admin, user.id);
  return NextResponse.json({ ok: true });
}

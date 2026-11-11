import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Where the signed-in reader is in an audiobook (?projectId=…). Guests keep their place in the browser instead. */
export async function GET(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ position: null });
  const projectId = new URL(req.url).searchParams.get("projectId") || "";
  const { data, error } = await createServiceClient().from("listening_positions").select("file_index, position_ms, speed, finished, updated_at").eq("user_id", user.id).eq("project_id", projectId).maybeSingle();
  if (error || !data) return NextResponse.json({ position: null });
  return NextResponse.json({ position: { fileIndex: data.file_index, positionMs: data.position_ms, speed: data.speed, finished: data.finished, updatedAt: data.updated_at } });
}

/** { projectId, fileIndex, positionMs, speed, finished? }, sent every few seconds while playing and on pause. */
export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ ok: false });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const n = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  const { error } = await createServiceClient()
    .from("listening_positions")
    .upsert({
      user_id: user.id,
      project_id: String(b.projectId || ""),
      file_index: Math.round(n(b.fileIndex, 0, 10_000, 0)),
      position_ms: Math.round(n(b.positionMs, 0, 24 * 3_600_000, 0)),
      speed: n(b.speed, 0.5, 3, 1),
      finished: b.finished === true,
      updated_at: new Date().toISOString(),
    });
  return NextResponse.json({ ok: !error });
}

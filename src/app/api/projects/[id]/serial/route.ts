import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasPro } from "@/lib/credits";
import { serialPlatform } from "@/lib/serial-export";
import { SERIAL_MIGRATION_HINT, normalizeSerialSettings } from "@/lib/serial-settings";

async function owner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return data ? user : null;
}

/** Release schedule and where each chapter has been posted. The log and reminders are Pro; exports are free. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await owner(id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const [pro, { data: project, error }, { data: posts }] = await Promise.all([
    userHasPro(user.id),
    admin.from("projects").select("serial_settings").eq("id", id).maybeSingle(),
    admin.from("serial_posts").select("chapter_id, platform, url, posted_on").eq("project_id", id),
  ]);
  if (error) return NextResponse.json({ pro, migrationNeeded: true, error: SERIAL_MIGRATION_HINT, settings: normalizeSerialSettings(null), posts: [] });
  return NextResponse.json({
    pro,
    settings: normalizeSerialSettings(project?.serial_settings),
    posts: (posts || []).map((p) => ({ chapterId: p.chapter_id, platform: p.platform, url: p.url, postedOn: p.posted_on })),
  });
}

/**
 *   { action: "settings", settings }
 *   { action: "log", chapterId, platform, url?, postedOn? }
 *   { action: "unlog", chapterId, platform }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await owner(id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userHasPro(user.id))) return NextResponse.json({ error: "The posting log and release reminders are part of Pro." }, { status: 402 });
  const admin = createServiceClient();
  const body = (await req.json().catch(() => ({}))) as { action?: string; settings?: unknown; chapterId?: string; platform?: string; url?: string; postedOn?: string };

  if (body.action === "settings") {
    const { data: current } = await admin.from("projects").select("serial_settings").eq("id", id).maybeSingle();
    const next = { ...normalizeSerialSettings(body.settings), lastRemindedOn: normalizeSerialSettings(current?.serial_settings).lastRemindedOn };
    const { error } = await admin.from("projects").update({ serial_settings: next }).eq("id", id);
    if (error) return NextResponse.json({ error: SERIAL_MIGRATION_HINT }, { status: 500 });
    return NextResponse.json({ ok: true, settings: next });
  }

  const platform = serialPlatform(String(body.platform || ""));
  const chapterId = String(body.chapterId || "");
  const { data: chapter } = await admin.from("chapters").select("id").eq("id", chapterId).eq("project_id", id).maybeSingle();
  if (!platform || !chapter) return NextResponse.json({ error: "Chapter or site not found" }, { status: 400 });

  if (body.action === "unlog") {
    await admin.from("serial_posts").delete().eq("chapter_id", chapterId).eq("platform", platform.id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "log") {
    const url = String(body.url || "").trim().slice(0, 500);
    if (url && !/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Links start with https://" }, { status: 400 });
    const postedOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.postedOn || "")) ? body.postedOn : new Date().toISOString().slice(0, 10);
    const { error } = await admin
      .from("serial_posts")
      .upsert({ user_id: user.id, project_id: id, chapter_id: chapterId, platform: platform.id, url, posted_on: postedOn }, { onConflict: "chapter_id,platform" });
    if (error) return NextResponse.json({ error: SERIAL_MIGRATION_HINT }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

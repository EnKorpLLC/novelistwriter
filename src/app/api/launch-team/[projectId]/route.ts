import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { followAuthor } from "@/lib/audience";
import { isTeamTask, TEAM_OPEN_AFTER_RELEASE_DAYS } from "@/lib/launch-team";

async function context(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createServiceClient();
  const { data: project } = await admin.from("projects").select("id, user_id, title, published, published_at, release_date, launch_public").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const studio = await userHasStudio(project.user_id);
  const anchor = project.release_date ? Date.parse(`${project.release_date}T00:00:00Z`) : project.published_at ? Date.parse(project.published_at) : null;
  const open = studio && (project.launch_public || project.published) && (anchor == null || Date.now() < anchor + TEAM_OPEN_AFTER_RELEASE_DAYS * 86400000);
  return { user, admin, project, open };
}

/** The signed-in reader's place on a book's launch team. */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await context(projectId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { count } = await ctx.admin.from("launch_team").select("user_id", { count: "exact", head: true }).eq("project_id", projectId);
  if (!ctx.user) return NextResponse.json({ open: ctx.open, member: false, members: count || 0 });
  const { data: row } = await ctx.admin.from("launch_team").select("tasks").eq("project_id", projectId).eq("user_id", ctx.user.id).maybeSingle();
  return NextResponse.json({ open: ctx.open, member: Boolean(row), tasks: row?.tasks || {}, members: count || 0, isAuthor: ctx.user.id === ctx.project.user_id });
}

/** Join or leave the team, or tick a task. */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await context(projectId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ctx.user) return NextResponse.json({ error: "Sign in to join the launch team." }, { status: 401 });
  if (ctx.user.id === ctx.project.user_id) return NextResponse.json({ error: "This is your own book." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; task?: string; done?: boolean };

  if (body.action === "join") {
    if (!ctx.open) return NextResponse.json({ error: "This launch team isn't taking new members." }, { status: 400 });
    const { error } = await ctx.admin.from("launch_team").upsert({ project_id: projectId, user_id: ctx.user.id }, { onConflict: "project_id,user_id", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await followAuthor(ctx.admin, { readerUserId: ctx.user.id, authorUserId: ctx.project.user_id });
    return NextResponse.json({ ok: true, member: true, tasks: {} });
  }
  const { data: row } = await ctx.admin.from("launch_team").select("tasks").eq("project_id", projectId).eq("user_id", ctx.user.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "You're not on this launch team." }, { status: 400 });
  if (body.action === "leave") {
    await ctx.admin.from("launch_team").delete().eq("project_id", projectId).eq("user_id", ctx.user.id);
    return NextResponse.json({ ok: true, member: false });
  }
  if (body.action === "task" && isTeamTask(body.task)) {
    const tasks = { ...((row.tasks as Record<string, string>) || {}) };
    if (body.done) tasks[body.task] = new Date().toISOString();
    else delete tasks[body.task];
    await ctx.admin.from("launch_team").update({ tasks }).eq("project_id", projectId).eq("user_id", ctx.user.id);
    return NextResponse.json({ ok: true, member: true, tasks });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

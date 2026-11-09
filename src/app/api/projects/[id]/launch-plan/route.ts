import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { authorSitePublic, userHasStudio } from "@/lib/credits";
import { normalizeBuyLinks } from "@/lib/arc";
import { projectCoverPath } from "@/lib/cover";
import { bookPath } from "@/lib/handles";
import { appUrl } from "@/lib/stripe";
import { LAUNCH_STEPS, normalizeLaunchPlan, type LaunchSignals } from "@/lib/launch-plan";

const MIGRATION_HINT = "Database needs an update. Run supabase/migration_launch_engine.sql in the Supabase SQL editor.";

async function owner(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  return project ? { user, project } : null;
}

const planState = normalizeLaunchPlan;

/** The countdown: release date, ticked steps, and signals that tick steps on their own. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { project, user } = auth;
  const admin = createServiceClient();

  const [studio, sitePublic, { data: arcs }, { count: listSize }, { data: profile }, { data: chapters }] = await Promise.all([
    userHasStudio(user.id),
    authorSitePublic(user.id),
    admin.from("arc_invites").select("status, review_posts").eq("project_id", id),
    admin
      .from("author_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("author_user_id", user.id)
      .is("unsubscribed_at", null),
    admin.from("profiles").select("handle").eq("id", user.id).maybeSingle(),
    admin.from("chapters").select("id, title").eq("project_id", id).order("sort_order"),
  ]);
  const links = normalizeBuyLinks(project.buy_links);
  const active = (arcs || []).filter((a) => a.status === "active");
  const signals: LaunchSignals = {
    launchVisible: sitePublic && Boolean(project.published || project.launch_public),
    hasCover: Boolean(projectCoverPath(project)),
    hasBlurb: Boolean(String(project.blurb || "").trim()),
    arcOpened: Boolean(project.arc_open) || (arcs || []).length > 0,
    arcReaders: active.length,
    arcReviews: active.filter((a) => a.review_posts && Object.keys(a.review_posts).length > 0).length,
    preorderLinks: links.filter((l) => l.preorder).length,
    buyLinks: links.filter((l) => !l.preorder).length,
    listSize: listSize || 0,
    published: Boolean(project.published),
  };
  const handle = profile?.handle as string | null;
  const [{ count: releaseList }, { count: queued }] = await Promise.all([
    admin
      .from("author_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("author_user_id", user.id)
      .is("unsubscribed_at", null)
      .not("confirmed_at", "is", null)
      .contains("release_project_ids", [id]),
    admin.from("email_queue").select("id", { count: "exact", head: true }).is("sent_at", null),
  ]);
  return NextResponse.json({
    releaseList: releaseList || 0,
    emailsWaiting: queued || 0,
    studio,
    migrationNeeded: !("launch_plan" in project),
    title: project.title || "Untitled",
    releaseDate: project.release_date || null,
    launchUrl: handle && project.slug ? appUrl(bookPath(handle, project.slug)) : null,
    state: planState(project.launch_plan),
    signals,
    chapters: (chapters || []).map((c) => ({ id: c.id, title: c.title || "Untitled" })),
  });
}

/** Tick or untick a step, or set the ARC target (Studio). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userHasStudio(auth.user.id))) {
    return NextResponse.json({ error: "The launch plan is part of Studio. Upgrade on the Billing page.", code: "studio_required" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    step?: string;
    done?: boolean;
    arcTarget?: number;
    sample?: { on?: boolean; chapterId?: string | null };
    spotlight?: boolean;
  };
  const state = planState(auth.project.launch_plan);
  if (body.step && LAUNCH_STEPS.some((s) => s.id === body.step)) {
    if (body.done) state.done[body.step] = new Date().toISOString();
    else delete state.done[body.step];
  }
  if (body.arcTarget !== undefined) {
    const t = Math.round(Number(body.arcTarget));
    if (Number.isFinite(t) && t >= 1 && t <= 500) state.arcTarget = t;
  }
  if (typeof body.spotlight === "boolean") state.spotlight = body.spotlight;
  if (body.sample) {
    state.sample = {
      on: body.sample.on === true,
      chapterId: typeof body.sample.chapterId === "string" ? body.sample.chapterId : null,
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ launch_plan: state }).eq("id", id).eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: /launch_plan/.test(error.message) ? MIGRATION_HINT : error.message }, { status: 500 });
  return NextResponse.json({ state });
}

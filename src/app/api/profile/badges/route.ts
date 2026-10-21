import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadTrustBadges } from "@/lib/trust-badges";
import { aiActionCounts } from "@/lib/ai-usage";
import { isArcWindowOpen } from "@/lib/arc";
import { userHasStudio } from "@/lib/credits";
import { ensureHandle } from "@/lib/public-site";
import { bookPath } from "@/lib/handles";

/** The author's own badge overview: account badge plus each book's badge and where it's public. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const [{ data: projects }, handle] = await Promise.all([
    admin
      .from("projects")
      .select("id, title, slug, updated_at, beta_ready, arc_open, arc_deadline, published, launch_public, ai_used_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    ensureHandle(admin, user.id),
  ]);
  const list = projects || [];
  const ids = list.map((p) => p.id);

  // Separate query so the overview still loads before migration_ai_disclosure.sql is applied
  const { data: disclosure } = ids.length
    ? await admin.from("projects").select("id, ai_disclosure_public, ai_deleted_job_counts").in("id", ids)
    : { data: [] as { id: string; ai_disclosure_public: boolean; ai_deleted_job_counts: unknown }[] };
  const disclosureById = new Map((disclosure || []).map((d) => [d.id, d]));

  const [{ aiOffSince, noAiProjectIds }, studio, { data: jobs }, actions] = await Promise.all([
    loadTrustBadges(admin, user.id, ids),
    userHasStudio(user.id),
    ids.length
      ? admin
          .from("ai_jobs")
          .select("project_id, created_at")
          .in("project_id", ids)
          .order("created_at", { ascending: true })
          .limit(2000)
      : Promise.resolve({ data: [] as { project_id: string; created_at: string }[] }),
    aiActionCounts(
      admin,
      list.map((p) => ({ id: p.id, ai_deleted_job_counts: disclosureById.get(p.id)?.ai_deleted_job_counts }))
    ),
  ]);
  const firstJob = new Map<string, string>();
  for (const j of jobs || []) if (!firstJob.has(j.project_id)) firstJob.set(j.project_id, j.created_at);

  return NextResponse.json({
    userId: user.id,
    aiOffSince,
    books: list.map((p) => {
      const shownOn: { label: string; href: string }[] = [];
      const betaOpen = studio && Boolean(p.beta_ready);
      const arcOpen = studio && isArcWindowOpen(p);
      if (handle && p.slug && (p.published || p.launch_public || betaOpen || arcOpen)) {
        shownOn.push({ label: "Launch page", href: bookPath(handle, p.slug) });
      }
      if (betaOpen) shownOn.push({ label: "Beta page", href: `/beta/book/${p.id}` });
      if (arcOpen) shownOn.push({ label: "ARC page", href: `/arc/book/${p.id}` });
      const aiUsedAt = [p.ai_used_at, firstJob.get(p.id)]
        .filter(Boolean)
        .sort()[0] as string | undefined;
      return {
        projectId: p.id,
        title: p.title,
        noAiOnBook: noAiProjectIds.has(p.id),
        aiUsedAt: aiUsedAt || null,
        aiActions: actions.get(p.id) || [],
        aiDisclosurePublic: Boolean(disclosureById.get(p.id)?.ai_disclosure_public),
        shownOn,
      };
    }),
  });
}

/** Author chooses whether a book's public pages list which AI actions were run (names only). */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { projectId?: string; disclose?: boolean };
  if (!body.projectId || typeof body.disclose !== "boolean") {
    return NextResponse.json({ error: "projectId and disclose required" }, { status: 400 });
  }
  const { error } = await supabase
    .from("projects")
    .update({ ai_disclosure_public: body.disclose })
    .eq("id", body.projectId)
    .eq("user_id", user.id);
  if (error) {
    const hint = error.message.includes("ai_disclosure_public")
      ? "Database needs an update. Run supabase/migration_ai_disclosure.sql in the Supabase SQL editor."
      : error.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  return NextResponse.json({ ok: true, aiDisclosurePublic: body.disclose });
}

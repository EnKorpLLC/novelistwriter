import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadTrustBadges } from "@/lib/trust-badges";
import { isArcWindowOpen } from "@/lib/arc";
import { userHasStudio } from "@/lib/credits";

/** The author's own badge overview: account badge plus each book's badge and where it's public. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const { data: projects } = await admin
    .from("projects")
    .select("id, title, updated_at, beta_ready, arc_open, arc_deadline, published, ai_used_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  const list = projects || [];
  const ids = list.map((p) => p.id);

  const [{ aiOffSince, noAiProjectIds }, studio, { data: jobs }] = await Promise.all([
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
  ]);
  const firstJob = new Map<string, string>();
  for (const j of jobs || []) if (!firstJob.has(j.project_id)) firstJob.set(j.project_id, j.created_at);

  return NextResponse.json({
    userId: user.id,
    aiOffSince,
    books: list.map((p) => {
      const shownOn: { label: string; href: string }[] = [];
      if (p.published) shownOn.push({ label: "Published page", href: `/books/${p.id}` });
      if (studio && p.beta_ready) shownOn.push({ label: "Beta page", href: `/beta/book/${p.id}` });
      if (studio && isArcWindowOpen(p)) shownOn.push({ label: "ARC page", href: `/arc/book/${p.id}` });
      const aiUsedAt = [p.ai_used_at, firstJob.get(p.id)]
        .filter(Boolean)
        .sort()[0] as string | undefined;
      return {
        projectId: p.id,
        title: p.title,
        noAiOnBook: noAiProjectIds.has(p.id),
        aiUsedAt: aiUsedAt || null,
        shownOn,
      };
    }),
  });
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TrustBadges = {
  /** Account-wide AI switch is off since this date */
  aiOffSince: string | null;
  /** No AI run has ever been recorded on this book */
  noAiOnBook: boolean;
};

/** Account badge plus per-book "No AI used" for any number of the author's books. */
export async function loadTrustBadges(
  admin: SupabaseClient,
  authorUserId: string,
  projectIds: string[]
): Promise<{ aiOffSince: string | null; noAiProjectIds: Set<string> }> {
  const [{ data: profile }, { data: projects }, { data: jobs }] = await Promise.all([
    admin
      .from("profiles")
      .select("ai_disabled, ai_disabled_since")
      .eq("id", authorUserId)
      .maybeSingle(),
    projectIds.length
      ? admin.from("projects").select("id, ai_used_at").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; ai_used_at: string | null }[] }),
    projectIds.length
      ? admin.from("ai_jobs").select("project_id").in("project_id", projectIds).limit(2000)
      : Promise.resolve({ data: [] as { project_id: string }[] }),
  ]);
  const usedAi = new Set((jobs || []).map((j) => j.project_id));
  // A missing ai_used_at column (before the migration) leaves projects null: show no badge
  const noAiProjectIds = new Set(
    (projects || []).filter((p) => !p.ai_used_at && !usedAi.has(p.id)).map((p) => p.id)
  );
  return {
    aiOffSince: profile?.ai_disabled ? profile.ai_disabled_since || null : null,
    noAiProjectIds,
  };
}

export async function trustBadgesForBook(
  admin: SupabaseClient,
  authorUserId: string,
  projectId: string
): Promise<TrustBadges> {
  const { aiOffSince, noAiProjectIds } = await loadTrustBadges(admin, authorUserId, [projectId]);
  return { aiOffSince, noAiOnBook: noAiProjectIds.has(projectId) };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_META } from "@/lib/ai/jobs";
import type { JobType } from "@/lib/types";

export type AiActionCount = { label: string; count: number };

export function aiActionLabel(jobType: string): string {
  return JOB_META[jobType as JobType]?.label || jobType.replace(/_/g, " ");
}

/** Count of each AI action per book: saved reports plus ones the author later deleted. Names only. */
export async function aiActionCounts(
  admin: SupabaseClient,
  projects: { id: string; ai_deleted_job_counts?: unknown }[]
): Promise<Map<string, AiActionCount[]>> {
  const ids = projects.map((p) => p.id);
  const totals = new Map<string, Map<string, number>>();
  for (const p of projects) {
    const deleted = (p.ai_deleted_job_counts || {}) as Record<string, number>;
    const m = new Map<string, number>();
    for (const [type, n] of Object.entries(deleted)) if (Number(n) > 0) m.set(type, Number(n));
    totals.set(p.id, m);
  }
  if (ids.length) {
    const { data: jobs } = await admin
      .from("ai_jobs")
      .select("project_id, job_type")
      .in("project_id", ids)
      .limit(5000);
    for (const j of jobs || []) {
      const m = totals.get(j.project_id) || new Map<string, number>();
      m.set(j.job_type, (m.get(j.job_type) || 0) + 1);
      totals.set(j.project_id, m);
    }
  }
  const out = new Map<string, AiActionCount[]>();
  for (const [projectId, m] of totals) {
    out.set(
      projectId,
      [...m.entries()]
        .map(([type, count]) => ({ label: aiActionLabel(type), count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    );
  }
  return out;
}

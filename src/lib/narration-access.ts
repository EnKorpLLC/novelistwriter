import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { normalizeTerms, type NarrationTerms, type NarratorJobStatus } from "@/lib/narration";

export type NarratorJob = {
  id: string;
  projectId: string;
  authorId: string;
  narratorId: string | null;
  inviteEmail: string;
  narratorName: string;
  status: NarratorJobStatus;
  terms: NarrationTerms;
  termsVersion: number;
  authorAcceptedAt: string | null;
  narratorAcceptedAt: string | null;
  message: string;
  declinedReason: string | null;
  createdAt: string;
  checkpointStatus: "pending" | "submitted" | "approved" | "changes";
  checkpointNote: string | null;
};

export function jobFromRow(r: Record<string, unknown>): NarratorJob {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    authorId: r.author_id as string,
    narratorId: (r.narrator_id as string) || null,
    inviteEmail: r.invite_email as string,
    narratorName: (r.narrator_name as string) || "",
    status: r.status as NarratorJobStatus,
    terms: normalizeTerms(r.terms),
    termsVersion: Number(r.terms_version) || 1,
    authorAcceptedAt: (r.author_accepted_at as string) || null,
    narratorAcceptedAt: (r.narrator_accepted_at as string) || null,
    message: (r.message as string) || "",
    declinedReason: (r.declined_reason as string) || null,
    createdAt: r.created_at as string,
    checkpointStatus: (["submitted", "approved", "changes"].includes(r.checkpoint_status as string) ? r.checkpoint_status : "pending") as NarratorJob["checkpointStatus"],
    checkpointNote: (r.checkpoint_note as string) || null,
  };
}

/** The active narrator job on a book, if there is one (null before migration_narrators.sql too). */
export async function activeJob(admin: SupabaseClient, projectId: string): Promise<NarratorJob | null> {
  const { data, error } = await admin.from("narrator_jobs").select("*").eq("project_id", projectId).eq("status", "active").maybeSingle();
  return error || !data ? null : jobFromRow(data);
}

export type AudioAccess = {
  user: User;
  role: "owner" | "narrator";
  authorId: string;
  job: NarratorJob | null;
  /** The studio is open: the author has Studio, or a narrator job is under way (it carries on if Studio lapses) */
  studio: boolean;
};

/**
 * Who may use a book's audiobook studio: the author, or the narrator of its active job. Narrators see
 * only this book's script, takes, and notes, nothing else of the author's.
 */
export async function audioAccess(projectId: string): Promise<AudioAccess | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createServiceClient();
  const { data: project } = await admin.from("projects").select("id, user_id").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const job = await activeJob(admin, projectId);
  if (project.user_id === user.id) {
    return { user, role: "owner", authorId: user.id, job, studio: Boolean(job) || (await userHasStudio(user.id)) };
  }
  if (job && job.narratorId === user.id) return { user, role: "narrator", authorId: project.user_id as string, job, studio: true };
  return null;
}

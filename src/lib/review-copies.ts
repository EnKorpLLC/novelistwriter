import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteObject, r2Configured, signedDownloadUrl } from "@/lib/r2";

/**
 * Review copies (audiobook A4b): a small MP3 of a chapter that the narrator sends the author.
 * They live in R2 for 30 days, or until the chapter is approved, whichever comes first.
 */

export const REVIEW_MAX_BYTES = 200 * 1024 * 1024;

export const reviewKey = (projectId: string, chapterId: string) => `review/${projectId}/${chapterId}/${Date.now()}.mp3`;

export type ReviewCopy = { id: string; chapterId: string; url: string; cuts: number[]; durationMs: number; createdAt: string; expiresAt: string; isCheckpoint: boolean };

/** The newest copy per chapter, each with a playback link that works for a few hours. */
export async function latestReviewCopies(admin: SupabaseClient, projectId: string): Promise<Record<string, ReviewCopy> | null> {
  if (!r2Configured()) return {};
  const { data, error } = await admin
    .from("audio_review_copies")
    .select("id, chapter_id, r2_key, cuts, duration_ms, created_at, expires_at, is_checkpoint")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return null;
  const out: Record<string, ReviewCopy> = {};
  for (const r of data || []) {
    if (out[r.chapter_id as string]) continue;
    out[r.chapter_id as string] = {
      id: r.id as string,
      chapterId: r.chapter_id as string,
      url: await signedDownloadUrl(r.r2_key as string, 4 * 3600),
      cuts: Array.isArray(r.cuts) ? (r.cuts as number[]) : [],
      durationMs: Number(r.duration_ms) || 0,
      createdAt: r.created_at as string,
      expiresAt: r.expires_at as string,
      isCheckpoint: Boolean(r.is_checkpoint),
    };
  }
  return out;
}

/** Deletes copies from storage and marks them gone. */
async function remove(admin: SupabaseClient, rows: { id: string; r2_key: string }[]) {
  for (const r of rows) await deleteObject(r.r2_key).catch(() => null);
  if (rows.length) await admin.from("audio_review_copies").update({ deleted_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
  return rows.length;
}

/** Older copies of a chapter once a new one arrives, or all of them once it's approved. */
export async function removeChapterCopies(admin: SupabaseClient, chapterId: string, keepId?: string) {
  if (!r2Configured()) return 0;
  let q = admin.from("audio_review_copies").select("id, r2_key").eq("chapter_id", chapterId).is("deleted_at", null);
  if (keepId) q = q.neq("id", keepId);
  const { data } = await q;
  return remove(admin, (data || []) as { id: string; r2_key: string }[]);
}

/** Daily: delete copies past their 30 days. */
export async function sweepReviewCopies(admin: SupabaseClient, opts: { timeBudgetMs: number }) {
  if (!r2Configured()) return 0;
  const started = Date.now();
  const { data, error } = await admin.from("audio_review_copies").select("id, r2_key").is("deleted_at", null).lt("expires_at", new Date().toISOString()).limit(200);
  if (error || !data?.length) return 0;
  let n = 0;
  for (const r of data as { id: string; r2_key: string }[]) {
    if (Date.now() - started > opts.timeBudgetMs) break;
    n += await remove(admin, [r]);
  }
  return n;
}

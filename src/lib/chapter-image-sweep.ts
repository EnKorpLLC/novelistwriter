import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const GRACE_DAYS = 7;
const folderOf = (userId: string, projectId: string) => `${userId}/${projectId}/chapter-images`;

async function listFolder(admin: SupabaseClient, folder: string) {
  const { data } = await admin.storage.from("covers").list(folder, { limit: 1000 });
  return (data || []).filter((f) => f.name && f.id);
}

/**
 * Removes chapter images no chapter or saved version uses anymore. Files stay for a week after they stop
 * being used, so undo and "restore this version" never bring back a broken image.
 */
export async function sweepChapterImages(admin: SupabaseClient, userId: string, projectId: string): Promise<number> {
  const folder = folderOf(userId, projectId);
  const files = await listFolder(admin, folder);
  if (!files.length) return 0;
  const cutoff = Date.now() - GRACE_DAYS * 86_400_000;
  const old = files.filter((f) => Date.parse(f.created_at || "") < cutoff);
  if (!old.length) return 0;

  const { data: chapters } = await admin.from("chapters").select("id, content_html").eq("project_id", projectId);
  const ids = (chapters || []).map((c) => c.id as string);
  let html = (chapters || []).map((c) => c.content_html || "").join("\n");
  for (let i = 0; i < ids.length; i += 100) {
    const { data: versions } = await admin.from("chapter_versions").select("content_html").in("chapter_id", ids.slice(i, i + 100));
    html += (versions || []).map((v) => v.content_html || "").join("\n");
  }
  const unused = old.filter((f) => !html.includes(`/chapter-images/${f.name}`)).map((f) => `${folder}/${f.name}`);
  if (unused.length) await admin.storage.from("covers").remove(unused);
  return unused.length;
}

/** When a book is deleted, its chapter images go with it. */
export async function removeAllChapterImages(admin: SupabaseClient, userId: string, projectId: string) {
  const folder = folderOf(userId, projectId);
  const files = await listFolder(admin, folder);
  if (files.length) await admin.storage.from("covers").remove(files.map((f) => `${folder}/${f.name}`));
}

/** Daily: tidy books whose chapters changed in the last day. */
export async function sweepRecentChapterImages(admin: SupabaseClient, opts: { limit?: number; timeBudgetMs?: number } = {}) {
  const started = Date.now();
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { data } = await admin.from("chapters").select("project_id, user_id").gte("updated_at", since).limit(5000);
  const books = [...new Map((data || []).map((r) => [r.project_id as string, r.user_id as string])).entries()].slice(0, opts.limit ?? 200);
  let removed = 0;
  for (const [projectId, userId] of books) {
    if (opts.timeBudgetMs && Date.now() - started > opts.timeBudgetMs) break;
    removed += await sweepChapterImages(admin, userId, projectId).catch(() => 0);
  }
  return removed;
}

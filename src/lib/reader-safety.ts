import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SAFETY_MIGRATION_HINT = "Database needs an update. Run supabase/migration_reader_trust.sql in the Supabase SQL editor.";
/** Distinct readers reporting an author's conduct before admin is asked to look at their catalog access */
export const CONDUCT_FLAG_AT = 3;
/** Reports one person can send in a day */
export const REPORTS_PER_DAY = 5;

/** Authors whose books this reader shouldn't see in catalogs: ones they blocked, and ones removed after conduct reports. */
export async function hiddenAuthorsFor(admin: SupabaseClient, readerId: string): Promise<Set<string>> {
  const [blocks, suspended] = await Promise.all([
    admin.from("reader_blocks").select("author_user_id").eq("reader_user_id", readerId),
    admin.from("profiles").select("id").not("catalog_suspended_at", "is", null).limit(2000),
  ]);
  return new Set([...(blocks.data || []).map((b) => b.author_user_id as string), ...(suspended.data || []).map((p) => p.id as string)]);
}

/** True when this reader has blocked this author (so the author can't invite or message them). */
export async function readerBlockedAuthor(admin: SupabaseClient, readerId: string | null | undefined, authorId: string): Promise<boolean> {
  if (!readerId) return false;
  const { data, error } = await admin.from("reader_blocks").select("reader_user_id").eq("reader_user_id", readerId).eq("author_user_id", authorId).maybeSingle();
  return !error && Boolean(data);
}

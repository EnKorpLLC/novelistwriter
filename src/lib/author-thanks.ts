import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { THANKS_READERS_MIN } from "@/lib/launch-team";

/** Whether an author regularly thanks their beta, ARC, and launch team readers. */
export async function thanksReaders(admin: SupabaseClient, authorUserId: string): Promise<boolean> {
  const since = new Date(Date.now() - 182 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("author_thanks")
    .select("id", { count: "exact", head: true })
    .eq("author_user_id", authorUserId)
    .gte("created_at", since);
  return !error && (count || 0) >= THANKS_READERS_MIN;
}

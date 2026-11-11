import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Public reader reviews: one per reader per book, with 1 to 5 stars, labeled by how they read it. Advance and beta
 * readers got the book free, which the label says (disclosure rules require it). Authors can reply once; the
 * admin can hide a review that breaks the rules. Authors can't remove reviews they don't like.
 */

export const REVIEWS_HINT = "Public reviews need a database update. Run supabase/migration_book_reviews.sql in the Supabase SQL editor.";

export type ReviewSource = "purchase" | "arc" | "beta";
export const SOURCE_LABEL: Record<ReviewSource, string> = {
  purchase: "Bought here",
  arc: "Advance reader (free copy)",
  beta: "Beta reader (read an early draft, free)",
};

export type PublicReview = { id: string; name: string; source: ReviewSource; stars: number; body: string; reply: string | null; at: string; mine?: boolean };

/** How this reader read the book, strongest first: bought it here, an ARC, or a beta draft. */
export async function reviewEligibility(admin: SupabaseClient, userId: string, email: string | null, projectId: string): Promise<ReviewSource[]> {
  const lower = String(email || "").toLowerCase();
  const [{ data: bought }, { data: arc }, { data: beta }] = await Promise.all([
    admin
      .from("book_purchases")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "paid")
      .gt("price_cents", 0)
      .or(`buyer_user_id.eq.${userId}${lower ? `,buyer_email.ilike.${lower}` : ""}`)
      .limit(5),
    admin.from("arc_invites").select("id, finished_at").eq("project_id", projectId).eq("reader_user_id", userId).not("finished_at", "is", null).limit(1),
    admin.from("beta_book_reviews").select("id").eq("project_id", projectId).eq("reader_user_id", userId).limit(1),
  ]);
  const out: ReviewSource[] = [];
  if ((bought || []).some((p) => !p.is_proof && ["ebook", "audiobook", "paperback"].includes(p.format || "ebook"))) out.push("purchase");
  if (arc?.length) out.push("arc");
  if (beta?.length) out.push("beta");
  return out;
}

/** A book's published reviews (newest first) and their average. Null before the migration. */
export async function reviewsFor(admin: SupabaseClient, projectId: string, viewerId?: string | null) {
  const { data, error } = await admin.from("book_reviews").select("*").eq("project_id", projectId).eq("status", "published").order("created_at", { ascending: false }).limit(200);
  if (error) return null;
  const rows = data || [];
  const count = rows.length;
  const avg = count ? Math.round((rows.reduce((n, r) => n + r.stars, 0) / count) * 10) / 10 : null;
  const reviews: PublicReview[] = rows.map((r) => ({
    id: r.id as string,
    name: (r.reviewer_name as string) || "A reader",
    source: r.source as ReviewSource,
    stars: r.stars as number,
    body: (r.body as string) || "",
    reply: (r.author_reply as string | null) || null,
    at: r.created_at as string,
    mine: Boolean(viewerId && r.reviewer_user_id === viewerId),
  }));
  return { avg, count, reviews };
}

/** Average stars for many books at once, for store cards. */
export async function ratingsFor(admin: SupabaseClient, projectIds: string[]) {
  const map = new Map<string, { avg: number; count: number }>();
  if (!projectIds.length) return map;
  const { data, error } = await admin.from("book_reviews").select("project_id, stars").in("project_id", projectIds).eq("status", "published").limit(20000);
  if (error) return map;
  const sums = new Map<string, { total: number; count: number }>();
  for (const r of data || []) {
    const s = sums.get(r.project_id as string) || { total: 0, count: 0 };
    s.total += r.stars as number;
    s.count += 1;
    sums.set(r.project_id as string, s);
  }
  for (const [id, s] of sums) map.set(id, { avg: Math.round((s.total / s.count) * 10) / 10, count: s.count });
  return map;
}

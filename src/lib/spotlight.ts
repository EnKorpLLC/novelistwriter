import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rowHasStudio, rowSitePublic } from "@/lib/credits";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { bookPath } from "@/lib/handles";
import { genreLabel } from "@/lib/beta-platform";
import { normalizeLaunchPlan } from "@/lib/launch-plan";

export type SpotlightBook = {
  id: string;
  authorUserId: string;
  title: string;
  tagline: string;
  authorName: string;
  href: string;
  coverUrl: string | null;
  genre: string;
  out: boolean;
  releaseDate: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * L3: Studio books releasing within a week either side of today whose authors opted in.
 * One book per author, shuffled fresh each day so every launch gets its turn at the front.
 */
export async function launchingThisWeek(admin: SupabaseClient, limit = 8): Promise<SpotlightBook[]> {
  const now = Date.now();
  const from = new Date(now - 7 * DAY_MS).toISOString().slice(0, 10);
  const to = new Date(now + 7 * DAY_MS).toISOString().slice(0, 10);
  const { data: rows, error } = await admin
    .from("projects")
    .select("id, user_id, title, tagline, slug, genre, cover_path, metadata, updated_at, release_date, published, published_at, launch_public, launch_plan")
    .eq("launch_plan->>spotlight", "true")
    .not("slug", "is", null)
    .or(`and(release_date.gte.${from},release_date.lte.${to}),published_at.gte.${new Date(now - 7 * DAY_MS).toISOString()}`)
    .limit(200);
  if (error || !rows?.length) return [];

  const authorIds = [...new Set(rows.map((r) => r.user_id as string))];
  const [{ data: balances }, { data: profiles }] = await Promise.all([
    admin.from("credit_balances").select("*").in("user_id", authorIds),
    admin.from("profiles").select("id, display_name, handle").in("id", authorIds),
  ]);
  const balanceById = new Map((balances || []).map((b) => [b.user_id as string, b]));
  const profileById = new Map((profiles || []).map((p) => [p.id as string, p]));

  const today = new Date(now).toISOString().slice(0, 10);
  const seen = new Set<string>();
  const eligible = rows
    .filter((r) => {
      const bal = balanceById.get(r.user_id) || null;
      const handle = profileById.get(r.user_id)?.handle;
      return handle && (r.published || r.launch_public) && rowHasStudio(bal) && rowSitePublic(bal) && normalizeLaunchPlan(r.launch_plan).spotlight;
    })
    .map((r) => ({ r, order: createHash("sha1").update(`${today}:${r.id}`).digest("hex") }))
    .sort((a, b) => a.order.localeCompare(b.order))
    .filter(({ r }) => (seen.has(r.user_id) ? false : (seen.add(r.user_id), true)))
    .slice(0, limit);

  return eligible.map(({ r }) => {
    const p = profileById.get(r.user_id)!;
    return {
      id: r.id,
      authorUserId: r.user_id,
      title: r.title || "Untitled",
      tagline: String(r.tagline || "").trim(),
      authorName: p.display_name || "An author",
      href: bookPath(p.handle as string, r.slug as string),
      coverUrl: coverPublicUrl(projectCoverPath(r), r.updated_at ? Date.parse(r.updated_at) : undefined),
      genre: genreLabel(r.genre),
      out: Boolean(r.published),
      releaseDate: r.release_date,
    };
  });
}

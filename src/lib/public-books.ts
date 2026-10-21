import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { genreLabel } from "@/lib/beta-platform";
import { normalizeBuyLinks, normalizeTropes } from "@/lib/arc";
import { bookPath } from "@/lib/handles";

export type PublishedBook = {
  id: string;
  title: string;
  genre: string;
  tropes: string[];
  blurb: string;
  coverUrl: string | null;
  authorUserId: string;
  authorName: string;
  buyLinks: { label: string; url: string }[];
  publishedAt: string | null;
  /** Launch page when the author has a handle and the book a slug; otherwise the old redirecting URL */
  href: string;
};

const FIELDS =
  "id, title, slug, genre, blurb, cover_path, metadata, updated_at, user_id, tropes, buy_links, published_at";

type Row = {
  id: string;
  title: string;
  slug?: string | null;
  genre: string | null;
  blurb: string | null;
  cover_path: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
  user_id: string;
  tropes: unknown;
  buy_links: unknown;
  published_at: string | null;
};

async function shapeRows(admin: SupabaseClient, rows: Row[]): Promise<PublishedBook[]> {
  const authorIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: authors } = authorIds.length
    ? await admin.from("profiles").select("id, display_name, handle").in("id", authorIds)
    : { data: [] as { id: string; display_name: string | null; handle: string | null }[] };
  const nameById = new Map((authors || []).map((a) => [a.id, a.display_name || "Author"]));
  const handleById = new Map((authors || []).map((a) => [a.id, a.handle as string | null]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    genre: genreLabel(r.genre),
    tropes: normalizeTropes(r.tropes),
    blurb: String(r.blurb || "").trim(),
    coverUrl: coverPublicUrl(projectCoverPath(r), r.updated_at ? Date.parse(r.updated_at) : undefined),
    authorUserId: r.user_id,
    authorName: nameById.get(r.user_id) || "Author",
    buyLinks: normalizeBuyLinks(r.buy_links).filter((l) => !l.preorder),
    publishedAt: r.published_at,
    href:
      handleById.get(r.user_id) && r.slug
        ? bookPath(handleById.get(r.user_id)!, r.slug)
        : `/books/${r.id}`,
  }));
}

export async function listPublishedBooks(
  admin: SupabaseClient,
  opts: { authorUserId?: string } = {}
): Promise<PublishedBook[]> {
  let q = admin
    .from("projects")
    .select(FIELDS)
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(500);
  if (opts.authorUserId) q = q.eq("user_id", opts.authorUserId);
  const { data, error } = await q;
  if (error || !data) return [];
  return shapeRows(admin, data as Row[]);
}

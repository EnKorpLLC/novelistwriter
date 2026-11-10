import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify, bookPath } from "@/lib/handles";
import { genreLabel } from "@/lib/beta-platform";
import { listPublishedBooks } from "@/lib/public-books";
import { launchingThisWeek } from "@/lib/spotlight";
import { isArcWindowOpen } from "@/lib/arc";
import { rowHasStudio, rowSitePublic } from "@/lib/credits";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { readerTrustForBooks } from "@/lib/trust-badges";
import { fetchAll } from "@/lib/supabase/fetch-all";

/** A genre page only goes live (and into the sitemap) once it has this many books and reader calls, so there are no thin pages. */
export const GENRE_MIN_ITEMS = 6;
/** The real-data word count only shows once this many published books stand behind it. */
const WORDCOUNT_MIN_BOOKS = 5;

export type GenreItem = { id: string; title: string; authorName: string; coverUrl: string | null; href: string; note: string; badges: string[] };
export type GenreHub = {
  key: string;
  label: string;
  launching: GenreItem[];
  arcs: GenreItem[];
  betas: GenreItem[];
  books: GenreItem[];
  medianWords: number | null;
  wordBooks: number;
  total: number;
};

export function genreKey(genre: string | null | undefined) {
  return slugify(genreLabel(genre), 50);
}

function badgeList(t: { trust: { noAiOnBook: boolean }; record: { badge: string | null } | null } | undefined): string[] {
  const out: string[] = [];
  if (t?.trust.noAiOnBook) out.push("No AI used on this book");
  if (t?.record?.badge === "written_here") out.push("Written in Novelist Writer");
  return out;
}

/** Every genre with what's in it right now. Genres below the minimum are returned but marked not live. */
export async function loadGenreHubs(admin: SupabaseClient): Promise<GenreHub[]> {
  const [published, launching, { data: calls }] = await Promise.all([
    listPublishedBooks(admin).catch(() => []),
    launchingThisWeek(admin, 60).catch(() => []),
    admin.from("projects").select("id, user_id, title, slug, genre, cover_path, metadata, updated_at, arc_open, arc_deadline, beta_ready").not("slug", "is", null).or("arc_open.eq.true,beta_ready.eq.true").limit(500),
  ]);

  // Reader calls only from Studio authors whose pages are public
  const callAuthors = [...new Set((calls || []).map((c) => c.user_id as string))];
  const [{ data: tiers }, { data: profiles }] = callAuthors.length
    ? await Promise.all([admin.from("credit_balances").select("*").in("user_id", callAuthors), admin.from("profiles").select("id, display_name, handle").in("id", callAuthors)])
    : [{ data: [] }, { data: [] }];
  const tierOf = new Map((tiers || []).map((t) => [t.user_id as string, t]));
  const profileOf = new Map((profiles || []).map((p) => [p.id as string, p as { display_name: string | null; handle: string | null }]));
  const openCalls = (calls || []).filter((c) => {
    const t = tierOf.get(c.user_id) || null;
    return profileOf.get(c.user_id)?.handle && rowHasStudio(t) && rowSitePublic(t) && (c.beta_ready || isArcWindowOpen(c));
  });

  const trust = await readerTrustForBooks(admin, [...published.map((b) => ({ id: b.id, user_id: b.authorUserId })), ...openCalls.map((c) => ({ id: c.id, user_id: c.user_id }))]).catch(() => new Map());

  const hubs = new Map<string, GenreHub>();
  const hub = (genre: string) => {
    const label = genreLabel(genre);
    const key = slugify(label, 50);
    if (!key || label === "Uncategorized") return null;
    if (!hubs.has(key)) hubs.set(key, { key, label, launching: [], arcs: [], betas: [], books: [], medianWords: null, wordBooks: 0, total: 0 });
    return hubs.get(key)!;
  };

  const launchIds = new Set<string>();
  for (const b of launching) {
    const h = hub(b.genre);
    if (!h) continue;
    launchIds.add(b.id);
    h.launching.push({ id: b.id, title: b.title, authorName: b.authorName, coverUrl: b.coverUrl, href: b.href, note: b.out ? "Out now" : "Launching soon", badges: badgeList(trust.get(b.id)) });
  }
  for (const c of openCalls) {
    const h = hub(c.genre);
    if (!h) continue;
    const p = profileOf.get(c.user_id)!;
    const item: GenreItem = {
      id: c.id,
      title: c.title || "Untitled",
      authorName: p.display_name || "An author",
      coverUrl: coverPublicUrl(projectCoverPath(c), c.updated_at ? Date.parse(c.updated_at) : undefined),
      href: bookPath(p.handle!, c.slug),
      note: "",
      badges: badgeList(trust.get(c.id)),
    };
    if (isArcWindowOpen(c)) h.arcs.push({ ...item, note: "Free advance copy" });
    else if (c.beta_ready) h.betas.push({ ...item, note: "Beta readers wanted" });
  }
  for (const b of published) {
    if (launchIds.has(b.id)) continue;
    const h = hub(b.genre);
    if (!h) continue;
    h.books.push({ id: b.id, title: b.title, authorName: b.authorName, coverUrl: b.coverUrl, href: b.href, note: "", badges: badgeList(trust.get(b.id)) });
  }

  // Typical length from real published books in each genre
  const byGenreIds = new Map<string, string[]>();
  for (const b of published) {
    const k = genreKey(b.genre);
    byGenreIds.set(k, [...(byGenreIds.get(k) || []), b.id]);
  }
  const ids = published.map((b) => b.id);
  if (ids.length) {
    const words = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 200) {
      const rows = await fetchAll<{ project_id: string; word_count: number }>((f, t) => admin.from("chapters").select("project_id, word_count").in("project_id", ids.slice(i, i + 200)).range(f, t)).catch(() => []);
      for (const r of rows) words.set(r.project_id, (words.get(r.project_id) || 0) + (r.word_count || 0));
    }
    for (const [k, list] of byGenreIds) {
      const h = hubs.get(k);
      const counts = list.map((id) => words.get(id) || 0).filter((w) => w >= 10_000).sort((a, b) => a - b);
      if (!h || counts.length < WORDCOUNT_MIN_BOOKS) continue;
      const m = Math.floor(counts.length / 2);
      h.medianWords = Math.round((counts.length % 2 ? counts[m] : (counts[m - 1] + counts[m]) / 2) / 1000) * 1000;
      h.wordBooks = counts.length;
    }
  }

  for (const h of hubs.values()) h.total = h.launching.length + h.arcs.length + h.betas.length + h.books.length;
  return [...hubs.values()].sort((a, b) => b.total - a.total);
}

/** Genres with enough real content to deserve a page. */
export async function liveGenres(): Promise<GenreHub[]> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    return (await loadGenreHubs(createServiceClient())).filter((h) => h.total >= GENRE_MIN_ITEMS);
  } catch {
    return [];
  }
}

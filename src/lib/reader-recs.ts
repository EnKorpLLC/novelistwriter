import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listPublishedBooks, type PublishedBook } from "@/lib/public-books";
import { hiddenAuthorsFor } from "@/lib/reader-safety";
import { publicReaderName } from "@/lib/beta-access";
import { normalizeBetaApplicationForm } from "@/lib/beta-form";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { NO_PREFS, hasPrefs, normalizePrefs, normalizeWarningIds, prefsHide, tropeScore, warningLabels, type ReadingPrefs } from "@/lib/reading-prefs";

/** Up to 30 words or phrases a reader would rather not see in genres, tropes, or content warnings. */
export function normalizeFilters(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\n]/) : [];
  const out = new Set<string>();
  for (const v of list) {
    const t = String(v || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (t.length >= 2) out.add(t);
  }
  return [...out].slice(0, 30);
}

/** Words to skip from the library, plus the genre and content warning choices from the reader dashboard. */
export type ReaderFilters = { words: string[]; prefs: ReadingPrefs };

export async function contentFiltersFor(admin: SupabaseClient, userId: string | null | undefined): Promise<ReaderFilters> {
  if (!userId) return { words: [], prefs: NO_PREFS };
  const { data, error } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) return { words: [], prefs: NO_PREFS };
  return { words: normalizeFilters(data?.content_filters), prefs: normalizePrefs(data?.reading_prefs) };
}

/** Why a book is left out by the reader's filters, or null to show it. */
export function readerFilterHit(f: ReaderFilters, book: { genre: string; tropes: string[]; warnings: string; warningIds?: string[] }): string | null {
  const ticked = warningLabels(book.warningIds || []).join(", ");
  const word = filterHit([book.genre, ...book.tropes, book.warnings, ticked].join(" \n "), f.words);
  if (word) return word;
  return prefsHide({ genre: book.genre, about: [...book.tropes, book.warnings].join(" \n "), warningIds: book.warningIds, tropes: book.tropes }, f.prefs);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The first filter word found in the book's genre, tropes, or content warnings (whole words only). */
export function filterHit(text: string, filters: string[]): string | null {
  const hay = text.toLowerCase();
  return filters.find((f) => new RegExp(`(^|[^a-z0-9])${escape(f)}([^a-z0-9]|$)`).test(hay)) || null;
}

/** Each book's written warnings (from the beta brief) and ticked warnings (from the launch page). */
async function warningsFor(admin: SupabaseClient, ids: string[]): Promise<Map<string, { text: string; ids: string[] }>> {
  const out = new Map<string, { text: string; ids: string[] }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("projects").select("*").in("id", ids.slice(i, i + 200));
    for (const r of data || []) out.set(r.id, { text: normalizeBetaApplicationForm(r.beta_application_form).contentWarnings, ids: normalizeWarningIds(r.content_warnings) });
  }
  return out;
}

/** Drop books that match the reader's filters, and say how many were hidden. */
export async function applyContentFilters<T extends Pick<PublishedBook, "id" | "genre" | "tropes">>(admin: SupabaseClient, filters: ReaderFilters, books: T[]) {
  if ((!filters.words.length && !hasPrefs(filters.prefs)) || !books.length) return { shown: books, hidden: 0 };
  const warnings = await warningsFor(admin, books.map((b) => b.id));
  const shown = books.filter((b) => {
    const w = warnings.get(b.id);
    return !readerFilterHit(filters, { genre: b.genre, tropes: b.tropes, warnings: w?.text || "", warningIds: w?.ids });
  });
  // Books with tropes the reader loves come first; otherwise the order is kept (sort is stable)
  if (filters.prefs.likeTropes.length) shown.sort((a, b) => tropeScore(b.tropes, filters.prefs) - tropeScore(a.tropes, filters.prefs));
  return { shown, hidden: books.length - shown.length };
}

export type Rec = { book: PublishedBook; reason: string };
export type ReaderLikeYou = { handle: string; name: string; shared: number };
export type FollowedPick = { book: PublishedBook; readerName: string; readerHandle: string | null };

type Entry = { user_id: string; project_id: string; shelf: string; rating: number | null };
const loved = (e: Pick<Entry, "shelf" | "rating">) => e.shelf === "finished" && (e.rating == null || e.rating >= 4);

/**
 * Recommendations from what readers who loved the same books went on to love. Private libraries only count toward
 * a pick when two or more readers back it, so nobody's shelf can be read back from a recommendation.
 * Falls back to the genres you read when there's no overlap yet.
 */
export async function recommendationsFor(admin: SupabaseClient, userId: string) {
  const [catalog, hiddenAuthors, filters, mineRes] = await Promise.all([
    listPublishedBooks(admin),
    hiddenAuthorsFor(admin, userId).catch(() => new Set<string>()),
    contentFiltersFor(admin, userId),
    admin.from("library_entries").select("project_id, shelf, rating").eq("user_id", userId).not("project_id", "is", null),
  ]);
  const byId = new Map(catalog.map((b) => [b.id, b]));
  const mine = (mineRes.data || []) as Omit<Entry, "user_id">[];
  const inLibrary = new Set(mine.map((e) => e.project_id));
  const myLoved = mine.filter(loved);
  const lovedIds = myLoved.map((e) => e.project_id);
  const eligible = (b: PublishedBook | undefined): b is PublishedBook => Boolean(b && !inLibrary.has(b.id) && b.authorUserId !== userId && !hiddenAuthors.has(b.authorUserId));

  // Readers who loved what you loved, and how many of your favorites they share
  const overlap = new Map<string, { count: number; firstShared: string }>();
  if (lovedIds.length) {
    const rows = await fetchAll<Entry>((from, to) =>
      admin.from("library_entries").select("user_id, project_id, shelf, rating").in("project_id", lovedIds.slice(0, 300)).neq("user_id", userId).eq("shelf", "finished").range(from, to)
    , 20000);
    for (const r of rows.filter(loved)) {
      const o = overlap.get(r.user_id) || { count: 0, firstShared: r.project_id };
      o.count += 1;
      overlap.set(r.user_id, o);
    }
  }
  const coReaders = [...overlap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 300);
  const coIds = coReaders.map(([id]) => id);
  const [{ data: profiles }, theirRows] = await Promise.all([
    coIds.length
      ? admin.from("profiles").select("id, handle, display_name, email, library_public, reader_profile_public").in("id", coIds)
      : Promise.resolve({ data: [] as { id: string; handle: string | null; display_name: string | null; email: string | null; library_public: boolean; reader_profile_public: boolean }[] }),
    coIds.length
      ? fetchAll<Entry>((from, to) => admin.from("library_entries").select("user_id, project_id, shelf, rating").in("user_id", coIds).eq("shelf", "finished").not("project_id", "is", null).range(from, to), 20000)
      : Promise.resolve([] as Entry[]),
  ]);
  const profileById = new Map((profiles || []).map((p) => [p.id, p]));
  const isPublic = (id: string) => Boolean(profileById.get(id)?.library_public);

  const scores = new Map<string, { score: number; supporters: Set<string>; publicSupporter: boolean; because: string }>();
  for (const r of theirRows.filter(loved)) {
    if (!eligible(byId.get(r.project_id))) continue;
    const o = overlap.get(r.user_id)!;
    const s = scores.get(r.project_id) || { score: 0, supporters: new Set<string>(), publicSupporter: false, because: o.firstShared };
    s.score += o.count * (r.rating === 5 ? 2 : 1);
    s.supporters.add(r.user_id);
    if (isPublic(r.user_id)) s.publicSupporter = true;
    scores.set(r.project_id, s);
  }
  const titleOf = (id: string) => byId.get(id)?.title || "a book you loved";
  let picks: Rec[] = [...scores.entries()]
    .filter(([, s]) => s.supporters.size >= 2 || s.publicSupporter)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([id, s]) => ({
      book: byId.get(id)!,
      reason: s.supporters.size >= 2 ? `${s.supporters.size} readers who loved ${titleOf(s.because)} loved this too` : `A reader who loved ${titleOf(s.because)} loved this too`,
    }));

  // Genre fallback: the genres on your shelves, newest first
  if (picks.length < 8) {
    const genreCount = new Map<string, number>();
    for (const e of mine) {
      const g = byId.get(e.project_id)?.genre;
      if (g && e.shelf !== "dnf") genreCount.set(g, (genreCount.get(g) || 0) + (loved(e) ? 2 : 1));
    }
    const genres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    const have = new Set(picks.map((p) => p.book.id));
    for (const g of genres) {
      for (const b of catalog.filter((x) => x.genre === g && !have.has(x.id) && eligible(x))) {
        picks.push({ book: b, reason: `Because you read ${g}` });
        have.add(b.id);
        if (picks.length >= 24) break;
      }
      if (picks.length >= 24) break;
    }
  }
  const filtered = await applyContentFilters(admin, filters, picks.slice(0, 40).map((p) => ({ ...p.book, _reason: p.reason })));
  picks = filtered.shown.slice(0, 12).map(({ _reason, ...book }) => ({ book: book as PublishedBook, reason: _reason }));

  // Readers like you: only readers who chose to share their shelves and have a public profile
  const readersLikeYou: ReaderLikeYou[] = coReaders
    .filter(([id, o]) => o.count >= 2 && profileById.get(id)?.library_public && profileById.get(id)?.reader_profile_public && profileById.get(id)?.handle)
    .slice(0, 6)
    .map(([id, o]) => {
      const p = profileById.get(id)!;
      return { handle: p.handle as string, name: publicReaderName(p.display_name, p.email, "Reader"), shared: o.count };
    });

  const fromFollowed = await followedPicks(admin, userId, byId, eligible);
  return { picks, readersLikeYou, fromFollowed, hidden: filtered.hidden, filters };
}

/** Recent favorites from readers you follow, if they share their shelves. */
async function followedPicks(admin: SupabaseClient, userId: string, byId: Map<string, PublishedBook>, eligible: (b: PublishedBook | undefined) => b is PublishedBook): Promise<FollowedPick[]> {
  const { data: follows, error } = await admin.from("reader_follows").select("followed_user_id").eq("follower_user_id", userId).limit(500);
  if (error || !follows?.length) return [];
  const { data: shared } = await admin
    .from("profiles")
    .select("id, handle, display_name, email, reader_profile_public")
    .in("id", follows.map((f) => f.followed_user_id))
    .eq("library_public", true);
  if (!shared?.length) return [];
  const { data: rows } = await admin
    .from("library_entries")
    .select("user_id, project_id, shelf, rating")
    .in("user_id", shared.map((s) => s.id))
    .eq("shelf", "finished")
    .not("project_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  const who = new Map(shared.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: FollowedPick[] = [];
  for (const r of (rows || []) as Entry[]) {
    const book = byId.get(r.project_id);
    if (!loved(r) || seen.has(r.project_id) || !eligible(book)) continue;
    seen.add(r.project_id);
    const p = who.get(r.user_id)!;
    out.push({ book, readerName: publicReaderName(p.display_name, p.email, "Reader"), readerHandle: p.reader_profile_public ? p.handle : null });
    if (out.length >= 8) break;
  }
  return out;
}

/** The finished-and-loved books a reader chose to show on their public profile. */
export async function publicShelfFor(admin: SupabaseClient, userId: string): Promise<PublishedBook[]> {
  const { data: rows, error } = await admin
    .from("library_entries")
    .select("project_id, shelf, rating")
    .eq("user_id", userId)
    .eq("shelf", "finished")
    .not("project_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error || !rows?.length) return [];
  const catalog = await listPublishedBooks(admin);
  const byId = new Map(catalog.map((b) => [b.id, b]));
  return rows.filter((r) => loved(r as Entry)).map((r) => byId.get(r.project_id as string)).filter((b): b is PublishedBook => Boolean(b)).slice(0, 24);
}

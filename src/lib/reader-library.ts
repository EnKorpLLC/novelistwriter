import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { bookPath } from "@/lib/handles";
import { normalizeDetails } from "@/lib/book/format";
import { listPublishedBooks } from "@/lib/public-books";
import type { ImportedBook, Shelf } from "@/lib/library-import";

export const LIBRARY_MIGRATION_HINT = "Database needs an update. Run supabase/migration_reader_library.sql in the Supabase SQL editor.";
export const SHELVES: { id: Shelf; label: string }[] = [
  { id: "reading", label: "Reading" },
  { id: "want", label: "Want to read" },
  { id: "finished", label: "Finished" },
  { id: "dnf", label: "Did not finish" },
];

type ProjectRow = {
  id: string;
  user_id: string;
  title: string | null;
  slug: string | null;
  series_id: string | null;
  book_details: unknown;
  cover_path: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
  published: boolean | null;
  launch_public: boolean | null;
  release_date: string | null;
};

const PROJECT_FIELDS = "id, user_id, title, slug, series_id, book_details, cover_path, metadata, updated_at, published, launch_public, release_date";

/** A series is its series record, or the author plus the series name typed into the book's details. */
export function seriesOf(p: Pick<ProjectRow, "user_id" | "series_id" | "book_details">, seriesTitles: Map<string, string>) {
  const d = normalizeDetails(p.book_details);
  const name = (p.series_id && seriesTitles.get(p.series_id)) || d.seriesName;
  if (!p.series_id && !name) return null;
  return { key: p.series_id || `${p.user_id}:${name.trim().toLowerCase()}`, name: name || "Series", number: Number.parseFloat(d.seriesNumber) || null };
}

export type LibraryBook = {
  id: string;
  projectId: string | null;
  title: string;
  author: string;
  coverUrl: string | null;
  href: string | null;
  shelf: Shelf;
  customShelves: string[];
  rating: number | null;
  finishedOn: string | null;
  isbn: string;
  source: string;
  /** Came from a beta read or advance copy rather than being added by hand */
  auto: boolean;
  series: { key: string; name: string; number: number | null } | null;
};

export type SeriesGroup = {
  key: string;
  name: string;
  author: string;
  authorUserId: string;
  followed: boolean;
  books: { projectId: string; title: string; number: number | null; href: string | null; coverUrl: string | null; out: boolean; releaseDate: string | null; shelf: Shelf | null }[];
};

async function describe(admin: SupabaseClient, projectIds: string[]) {
  const ids = [...new Set(projectIds)];
  if (!ids.length) return { byId: new Map<string, ProjectRow>(), authors: new Map<string, { name: string; handle: string | null }>(), seriesTitles: new Map<string, string>() };
  const { data: rows } = await admin.from("projects").select(PROJECT_FIELDS).in("id", ids);
  const projects = (rows || []) as ProjectRow[];
  const authorIds = [...new Set(projects.map((p) => p.user_id))];
  const seriesIds = [...new Set(projects.map((p) => p.series_id).filter(Boolean))] as string[];
  const [{ data: profiles }, { data: series }] = await Promise.all([
    authorIds.length ? admin.from("profiles").select("id, display_name, handle").in("id", authorIds) : Promise.resolve({ data: [] }),
    seriesIds.length ? admin.from("series").select("id, title").in("id", seriesIds) : Promise.resolve({ data: [] }),
  ]);
  return {
    byId: new Map(projects.map((p) => [p.id, p])),
    authors: new Map((profiles || []).map((p) => [p.id as string, { name: (p.display_name as string) || "Author", handle: (p.handle as string | null) || null }])),
    seriesTitles: new Map((series || []).map((s) => [s.id as string, s.title as string])),
  };
}

const hrefOf = (p: ProjectRow, handle: string | null) => (handle && p.slug && (p.published || p.launch_public) ? bookPath(handle, p.slug) : null);

/** The reader's shelves, with beta reads and advance copies folded in, and the series their books belong to. */
export async function loadLibrary(admin: SupabaseClient, userId: string): Promise<{ books: LibraryBook[]; series: SeriesGroup[] } | { error: string }> {
  const { data: entries, error } = await admin.from("library_entries").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(5000);
  if (error) return { error: /library_entries/.test(error.message) ? LIBRARY_MIGRATION_HINT : error.message };

  // Beta reads and advance copies are part of the library without adding them by hand
  const [{ data: betas }, { data: arcs }] = await Promise.all([
    admin.from("beta_invites").select("project_id, status, finished_at").eq("reader_user_id", userId),
    admin.from("arc_invites").select("project_id, status, finished_at").eq("reader_user_id", userId),
  ]);
  const have = new Set((entries || []).map((e) => e.project_id).filter(Boolean));
  const auto = new Map<string, Shelf>();
  for (const i of [...(betas || []), ...(arcs || [])]) {
    if (have.has(i.project_id)) continue;
    const shelf: Shelf | null = i.finished_at ? "finished" : i.status === "dnf" ? "dnf" : ["accepted", "active"].includes(i.status) ? "reading" : null;
    if (shelf && auto.get(i.project_id) !== "finished") auto.set(i.project_id, shelf);
  }

  const { byId, authors, seriesTitles } = await describe(admin, [...(entries || []).map((e) => e.project_id).filter(Boolean), ...auto.keys()]);
  const make = (projectId: string | null, base: Omit<LibraryBook, "title" | "author" | "coverUrl" | "href" | "series" | "projectId">, title: string, author: string): LibraryBook => {
    const p = projectId ? byId.get(projectId) : null;
    const a = p ? authors.get(p.user_id) : null;
    return {
      ...base,
      projectId,
      title: p?.title || title || "Untitled",
      author: (p && (normalizeDetails(p.book_details).penName || a?.name)) || author,
      coverUrl: p ? coverPublicUrl(projectCoverPath(p), p.updated_at ? Date.parse(p.updated_at) : undefined) : null,
      href: p ? hrefOf(p, a?.handle || null) : null,
      series: p ? seriesOf(p, seriesTitles) : null,
    };
  };

  const books: LibraryBook[] = [
    ...(entries || []).map((e) =>
      make(e.project_id, { id: e.id, shelf: e.shelf, customShelves: e.custom_shelves || [], rating: e.rating, finishedOn: e.finished_on, isbn: e.isbn || "", source: e.source, auto: false }, e.title, e.author)
    ),
    ...[...auto.entries()].map(([pid, shelf]) => make(pid, { id: `auto:${pid}`, shelf, customShelves: [], rating: null, finishedOn: null, isbn: "", source: "here", auto: true }, "", "")),
  ];

  // Series in order, including books the reader doesn't have yet
  const keys = new Map<string, { authorId: string; name: string }>();
  for (const b of books) {
    if (b.series && b.projectId) keys.set(b.series.key, { authorId: byId.get(b.projectId)!.user_id, name: b.series.name });
  }
  const series: SeriesGroup[] = [];
  if (keys.size) {
    const authorIds = [...new Set([...keys.values()].map((k) => k.authorId))];
    const [{ data: authorBooks }, { data: follows }] = await Promise.all([
      admin.from("projects").select(PROJECT_FIELDS).in("user_id", authorIds).or("published.eq.true,launch_public.eq.true").limit(2000),
      admin.from("series_follows").select("series_key").eq("user_id", userId),
    ]);
    const more = await describe(admin, (authorBooks || []).map((p) => p.id));
    const followed = new Set((follows || []).map((f) => f.series_key));
    const shelfOf = new Map(books.filter((b) => b.projectId).map((b) => [b.projectId!, b.shelf]));
    for (const [key, info] of keys) {
      const inSeries = ((authorBooks || []) as ProjectRow[])
        .map((p) => ({ p, s: seriesOf(p, more.seriesTitles) }))
        .filter((x) => x.s?.key === key)
        .sort((a, b) => (a.s!.number ?? 999) - (b.s!.number ?? 999) || String(a.p.release_date || "").localeCompare(String(b.p.release_date || "")));
      if (inSeries.length < 2) continue;
      const handle = more.authors.get(info.authorId)?.handle || null;
      series.push({
        key,
        name: info.name,
        author: more.authors.get(info.authorId)?.name || "Author",
        authorUserId: info.authorId,
        followed: followed.has(key),
        books: inSeries.map(({ p, s }) => ({
          projectId: p.id,
          title: p.title || "Untitled",
          number: s!.number,
          href: hrefOf(p, handle),
          coverUrl: coverPublicUrl(projectCoverPath(p), p.updated_at ? Date.parse(p.updated_at) : undefined),
          out: Boolean(p.published),
          releaseDate: p.release_date,
          shelf: shelfOf.get(p.id) || null,
        })),
      });
    }
  }
  return { books, series };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Adds imported books, linking ones that are published here, and skipping ones already on the shelves. */
export async function importBooks(admin: SupabaseClient, userId: string, source: "goodreads" | "storygraph", imported: ImportedBook[]) {
  const [{ data: existing }, published] = await Promise.all([
    admin.from("library_entries").select("project_id, title, author").eq("user_id", userId).limit(10000),
    listPublishedBooks(admin).catch(() => []),
  ]);
  const haveProject = new Set((existing || []).map((e) => e.project_id).filter(Boolean));
  const haveTitle = new Set((existing || []).map((e) => `${norm(e.title)}|${norm(e.author)}`));
  const hereByTitle = new Map(published.map((b) => [`${norm(b.title)}|${norm(b.authorName)}`, b.id]));
  const rows: Record<string, unknown>[] = [];
  let linked = 0;
  for (const b of imported.slice(0, 5000)) {
    const key = `${norm(b.title)}|${norm(b.author)}`;
    const projectId = hereByTitle.get(key) || null;
    if ((projectId && haveProject.has(projectId)) || haveTitle.has(key)) continue;
    haveTitle.add(key);
    if (projectId) {
      haveProject.add(projectId);
      linked += 1;
    }
    rows.push({
      user_id: userId,
      project_id: projectId,
      title: b.title.slice(0, 300),
      author: b.author.slice(0, 200),
      isbn: b.isbn.slice(0, 20),
      source,
      shelf: b.shelf,
      custom_shelves: b.customShelves.map((s) => s.slice(0, 40)),
      rating: b.rating,
      finished_on: b.finishedOn,
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("library_entries").insert(rows.slice(i, i + 500));
    if (error) throw new Error(/library_entries/.test(error.message) ? LIBRARY_MIGRATION_HINT : error.message);
  }
  return { added: rows.length, linked, skipped: imported.length - rows.length };
}

/** The series a Novelist Writer book belongs to, if any. */
export async function seriesForProject(admin: SupabaseClient, projectId: string) {
  const { byId, seriesTitles } = await describe(admin, [projectId]);
  const p = byId.get(projectId);
  if (!p) return null;
  const s = seriesOf(p, seriesTitles);
  return s ? { ...s, authorUserId: p.user_id } : null;
}

/** Daily: tell series followers when a new book in the series is out. */
export async function notifySeriesReleases(admin: SupabaseClient, notify: (userId: string, title: string, body: string, href: string) => Promise<void>) {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data } = await admin.from("projects").select("id, published_at").eq("published", true).gte("published_at", since).limit(200);
  const fresh = (data || []) as { id: string; published_at: string }[];
  if (!fresh.length) return 0;
  const { byId, authors, seriesTitles } = await describe(admin, fresh.map((p) => p.id));
  let sent = 0;
  for (const raw of fresh) {
    const p = byId.get(raw.id);
    const s = p ? seriesOf(p, seriesTitles) : null;
    if (!p || !s) continue;
    const { data: followers } = await admin.from("series_follows").select("user_id, last_notified_at").eq("series_key", s.key).lt("last_notified_at", raw.published_at);
    const a = authors.get(p.user_id);
    for (const f of followers || []) {
      await notify(f.user_id, `New in ${s.name}: ${p.title}`, `${a?.name || "The author"} just published the next book in a series you follow.`, hrefOf(p, a?.handle || null) || "/library");
      await admin.from("series_follows").update({ last_notified_at: new Date().toISOString() }).eq("user_id", f.user_id).eq("series_key", s.key);
      sent += 1;
    }
  }
  return sent;
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Shelf = "want" | "reading" | "finished" | "dnf";
type Book = {
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
  source: string;
  auto: boolean;
  series: { key: string; name: string; number: number | null } | null;
};
type Series = {
  key: string;
  name: string;
  author: string;
  followed: boolean;
  books: { projectId: string; title: string; number: number | null; href: string | null; coverUrl: string | null; out: boolean; releaseDate: string | null; shelf: Shelf | null }[];
};

type RecBook = { id: string; title: string; authorName: string; genre: string; coverUrl: string | null; href: string };
type Recs = {
  picks: { book: RecBook; reason: string }[];
  readersLikeYou: { handle: string; name: string; shared: number }[];
  fromFollowed: { book: RecBook; readerName: string; readerHandle: string | null }[];
  hidden: number;
  filters: string[];
};
type List = { id: string; title: string; description: string; public: boolean; items: { projectId: string; title: string; note: string }[] };
type Prefs = { libraryPublic: boolean; contentFilters: string[]; profilePublic: boolean; handle: string | null };

const SHELF_LABEL: Record<Shelf, string> = { reading: "Reading", want: "To be read (TBR)", finished: "Finished", dnf: "Did not finish" };
const SOURCE_LABEL: Record<string, string> = { goodreads: "From Goodreads", storygraph: "From StoryGraph" };

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [view, setView] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [lists, setLists] = useState<List[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadLists = useCallback(async () => {
    const res = await fetch("/api/lists").catch(() => null);
    if (res?.ok) setLists((await res.json()).lists || []);
  }, []);
  const load = useCallback(async () => {
    const res = await fetch("/api/library");
    if (res.status === 401) return setError("signin");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error || "Could not load your library");
    setBooks(json.books);
    setSeries(json.series || []);
    setSelected(new Set());
    void loadLists();
  }, [loadLists]);

  async function addToList(listId: string) {
    const ids = (books || []).filter((b) => selected.has(b.id) && b.projectId).map((b) => b.projectId as string);
    if (!ids.length) return setNote("Only books published here can go on a list.");
    const res = await fetch("/api/lists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: listId, addProjectIds: ids }) });
    setNote(res.ok ? "Added to the list." : "Could not add to the list.");
    void loadLists();
  }
  useEffect(() => {
    void load();
  }, [load]);

  const custom = useMemo(() => [...new Set((books || []).flatMap((b) => b.customShelves))].sort(), [books]);
  const shown = (books || []).filter((b) => view === "all" || b.shelf === view || (view.startsWith("#") && b.customShelves.includes(view.slice(1))));

  async function call(method: string, body: unknown, done?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/library", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong");
      if (done) setNote(done);
      await load();
      return json;
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    setNote("Importing…");
    const csv = await file.text();
    const r = await call("POST", { action: "import", csv });
    if (r?.ok) setNote(`Imported ${r.added} books from ${r.source === "goodreads" ? "Goodreads" : "StoryGraph"}${r.linked ? `, ${r.linked} of them published here` : ""}${r.skipped ? `. ${r.skipped} were already on your shelves` : ""}.`);
  }

  if (error === "signin") {
    return (
      <div className="font-ui mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl">Your library</h1>
        <p className="mt-3 text-muted">Shelves, series, and your reading history in one place, free. Bring it from Goodreads or StoryGraph in one step.</p>
        <Link href="/beta/signup?next=/library" className="mt-6 inline-block bg-accent px-5 py-2.5 text-paper">
          Create a free reader account
        </Link>
        <p className="mt-3 text-sm">
          Have an account?{" "}
          <Link href="/login?next=/library" className="text-accent underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }
  if (error) return <p className="font-ui p-10 text-sm text-danger">{error}</p>;
  if (!books) return <p className="font-ui p-10 text-sm text-muted">Loading…</p>;

  const count = (s: Shelf) => books.filter((b) => b.shelf === s).length;
  const tabs: [string, string][] = [
    ["all", `All (${books.length})`],
    ...(["reading", "want", "finished", "dnf"] as Shelf[]).map((s) => [s, `${SHELF_LABEL[s]} (${count(s)})`] as [string, string]),
    ...custom.map((c) => [`#${c}`, `#${c}`] as [string, string]),
  ];

  return (
    <div className="font-ui mx-auto min-h-screen max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link href="/beta/dashboard" className="text-sm text-accent hover:underline">
            ← Reader dashboard
          </Link>
          <h1 className="font-display mt-2 text-3xl">My library</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          <button type="button" disabled={busy} className="border border-line px-3 py-1.5" onClick={() => fileRef.current?.click()}>
            Import from Goodreads or StoryGraph
          </button>
          <a href="/api/library/export" className="border border-line px-3 py-1.5">
            Export (CSV)
          </a>
        </div>
      </div>
      <p className="mt-2 max-w-2xl text-xs text-muted">
        Import uses the CSV file from Goodreads (My Books → Import and export → Export library) or StoryGraph (Manage account → Export
        StoryGraph library). Your beta reads and advance copies appear here on their own. Saving a book doesn&apos;t buy it, and authors only see how many readers have their book on a shelf or list, never who.
      </p>
      {note && <p className="mt-3 text-sm text-accent">{note}</p>}

      {series.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl">Series you&apos;re reading</h2>
          <ul className="mt-3 space-y-4">
            {series.map((s) => {
              const next = s.books.find((b) => b.shelf !== "finished");
              return (
                <li key={s.key} className="border border-line p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span>
                      <span className="font-display text-lg">{s.name}</span> <span className="text-muted">by {s.author}</span>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-xs text-accent underline"
                      onClick={() => void call("POST", { action: s.followed ? "unfollow" : "follow", projectId: s.books[0].projectId }, s.followed ? "Stopped following." : "You'll hear when the next book is out.")}
                    >
                      {s.followed ? "✓ Following: you'll hear about new books" : "Tell me when the next book is out"}
                    </button>
                  </div>
                  <ol className="mt-2 flex flex-wrap gap-3">
                    {s.books.map((b, i) => (
                      <li key={b.projectId} className="w-24 text-xs">
                        <a href={b.href || "#"} className={`block ${b.href ? "" : "pointer-events-none"}`}>
                          {b.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.coverUrl} alt="" className={`aspect-[2/3] w-full object-cover ${b.shelf === "finished" ? "" : "opacity-80"}`} />
                          ) : (
                            <div className="flex aspect-[2/3] items-center justify-center bg-paper-deep p-1 text-center">{b.title}</div>
                          )}
                        </a>
                        <p className="mt-1 text-muted">
                          Book {b.number ?? i + 1}
                          {b.shelf === "finished" ? " ✓" : b.shelf === "reading" ? " · reading" : ""}
                        </p>
                        {next?.projectId === b.projectId && (
                          <p className="text-accent">{b.out ? "Next up" : b.releaseDate ? `Coming ${b.releaseDate}` : "Coming soon"}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-2 text-xs">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={`border px-3 py-1.5 ${view === id ? "border-accent bg-accent/5 text-ink" : "border-line text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mt-3 flex flex-wrap items-center gap-2 border border-accent bg-paper p-2 text-sm">
          <span>{selected.size} selected</span>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && void call("PATCH", { ids: [...selected], shelf: e.target.value }, "Moved.")}
            className="border border-line px-2 py-1"
          >
            <option value="" disabled>
              Move to…
            </option>
            {(Object.keys(SHELF_LABEL) as Shelf[]).map((s) => (
              <option key={s} value={s}>
                {SHELF_LABEL[s]}
              </option>
            ))}
          </select>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add to a shelf (e.g. favorites)" className="border border-line px-2 py-1" />
          <button type="button" disabled={!tag.trim()} className="border border-line px-2 py-1 disabled:opacity-50" onClick={() => void call("PATCH", { ids: [...selected], addShelf: tag.trim() }, `Added to #${tag.trim()}.`).then(() => setTag(""))}>
            Add
          </button>
          {lists.length > 0 && (
            <select defaultValue="" onChange={(e) => e.target.value && void addToList(e.target.value)} className="border border-line px-2 py-1">
              <option value="" disabled>
                Add to list…
              </option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          )}
          {view.startsWith("#") && (
            <button type="button" className="border border-line px-2 py-1" onClick={() => void call("PATCH", { ids: [...selected], removeShelf: view.slice(1) }, "Removed from the shelf.")}>
              Remove from {view}
            </button>
          )}
          <button
            type="button"
            className="ml-auto text-danger underline"
            onClick={() => window.confirm(`Remove ${selected.size} books from your library?`) && void call("DELETE", { ids: [...selected] }, "Removed.")}
          >
            Remove from library
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          Nothing here yet. Find books in the <Link href="/books" className="text-accent underline">catalog</Link> and save them with “Add to TBR”, or import
          your history above.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {shown.map((b) => (
            <li key={b.id} className="flex items-center gap-3 py-2 text-sm">
              <input
                type="checkbox"
                aria-label={`Select ${b.title}`}
                checked={selected.has(b.id)}
                onChange={(e) =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(b.id);
                    else n.delete(b.id);
                    return n;
                  })
                }
              />
              {b.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.coverUrl} alt="" className="h-14 w-10 shrink-0 object-cover" />
              ) : (
                <div className="h-14 w-10 shrink-0 bg-paper-deep" />
              )}
              <div className="min-w-0 flex-1">
                {b.href ? (
                  <a href={b.href} className="font-display text-base hover:text-accent">
                    {b.title}
                  </a>
                ) : (
                  <span className="font-display text-base">{b.title}</span>
                )}
                <p className="text-xs text-muted">
                  {b.author}
                  {b.series ? ` · ${b.series.name}${b.series.number ? ` #${b.series.number}` : ""}` : ""}
                  {b.auto ? " · From your beta reads and ARCs" : SOURCE_LABEL[b.source] ? ` · ${SOURCE_LABEL[b.source]}` : ""}
                  {b.customShelves.length ? ` · ${b.customShelves.map((c) => `#${c}`).join(" ")}` : ""}
                </p>
              </div>
              <span className="hidden text-xs text-muted sm:inline">{SHELF_LABEL[b.shelf]}</span>
              <span className="flex" aria-label="Your rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    title={`${n} star${n === 1 ? "" : "s"}`}
                    onClick={() => void call("PATCH", { ids: [b.id], rating: b.rating === n ? null : n })}
                    className={`px-0.5 ${b.rating && n <= b.rating ? "text-accent" : "text-line"}`}
                  >
                    ★
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Purchases />
      <Recommendations version={books.length} />
      <Lists lists={lists} reload={loadLists} />
      <SharingAndFilters />
    </div>
  );
}

/** Ebooks bought direct: yours forever, download anytime. */
function Purchases() {
  const [items, setItems] = useState<
    { id: string; title: string; priceCents: number; boughtAt: string; downloadUrl: string; format?: string; preorderRelease?: string | null }[]
  >([]);
  useEffect(() => {
    void fetch("/api/library/purchases")
      .then(async (r) => (r.ok ? setItems((await r.json()).purchases || []) : null))
      .catch(() => null);
  }, []);
  if (!items.length) return null;
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="font-display text-2xl">Your books</h2>
      <p className="mt-1 text-xs text-muted">
        Yours to keep. Download them again anytime; audiobooks remember your place on every device.{" "}
        <a href="/refunds" className="underline">
          Refunds and your books
        </a>
      </p>
      <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
        {items.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="font-display text-base">{p.title}</span>
            <span className="flex items-center gap-3 text-xs">
              <span className="text-muted">
                {p.preorderRelease
                  ? `Pre-ordered · arrives ${new Date(`${p.preorderRelease}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC" })}`
                  : `${p.priceCents ? "Bought" : "Free since"} ${new Date(p.boughtAt).toLocaleDateString()}`}
              </span>
              <a href={p.downloadUrl} className="border border-accent px-2 py-1 text-accent">
                {p.preorderRelease ? "See pre-order" : p.format === "paperback" || p.format === "item" ? "See order" : p.format === "audiobook" || p.title.endsWith("(audiobook)") ? "Listen" : "Download"}
              </a>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BookTile({ book, line }: { book: RecBook; line: ReactNode }) {
  return (
    <li className="text-xs">
      <a href={book.href} className="group block">
        {book.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.coverUrl} alt="" className="aspect-[2/3] w-full border border-line object-cover group-hover:opacity-90" />
        ) : (
          <div className="font-display flex aspect-[2/3] items-center justify-center border border-line bg-paper-deep p-2 text-center text-sm text-muted">{book.title}</div>
        )}
        <p className="font-display mt-1 text-sm leading-tight group-hover:text-accent">{book.title}</p>
      </a>
      <p className="text-muted">{book.authorName}</p>
      <p className="mt-0.5 text-muted">{line}</p>
    </li>
  );
}

/** Picks from readers who loved the same books, then genres you read; content filters applied. */
function Recommendations({ version }: { version: number }) {
  const [recs, setRecs] = useState<Recs | null>(null);
  useEffect(() => {
    void fetch("/api/library/recommendations")
      .then(async (r) => (r.ok ? setRecs(await r.json()) : null))
      .catch(() => null);
  }, [version]);
  if (!recs || (!recs.picks.length && !recs.fromFollowed.length && !recs.readersLikeYou.length && !recs.hidden)) return null;
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="font-display text-2xl">Recommended for you</h2>
      <p className="mt-1 text-xs text-muted">
        From readers who loved the same books you did, never from ads or paid placement.
        {recs.hidden > 0 && ` ${recs.hidden} book${recs.hidden === 1 ? " was" : "s were"} left out because of your content filters.`}
      </p>
      {recs.picks.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4 md:grid-cols-6">
          {recs.picks.map((p) => (
            <BookTile key={p.book.id} book={p.book} line={p.reason} />
          ))}
        </ul>
      )}
      {recs.fromFollowed.length > 0 && (
        <>
          <h3 className="font-display mt-8 text-lg">Loved by readers you follow</h3>
          <ul className="mt-3 grid grid-cols-2 gap-5 sm:grid-cols-4 md:grid-cols-6">
            {recs.fromFollowed.map((p) => (
              <BookTile
                key={p.book.id}
                book={p.book}
                line={
                  p.readerHandle ? (
                    <Link href={`/r/${p.readerHandle}`} className="underline">
                      {p.readerName}
                    </Link>
                  ) : (
                    p.readerName
                  )
                }
              />
            ))}
          </ul>
        </>
      )}
      {recs.readersLikeYou.length > 0 && (
        <>
          <h3 className="font-display mt-8 text-lg">Readers like you</h3>
          <p className="text-xs text-muted">Readers who share their shelves and loved several of the same books. Follow them to see what they love next.</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {recs.readersLikeYou.map((r) => (
              <li key={r.handle}>
                <Link href={`/r/${r.handle}`} className="inline-block border border-line px-3 py-1.5 hover:border-accent">
                  {r.name} <span className="text-xs text-muted">· {r.shared} in common</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Lists({ lists, reload }: { lists: List[]; reload: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function send(method: string, body: unknown) {
    const res = await fetch("/api/lists", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setMsg(res.ok ? null : json.error || "Something went wrong");
    await reload();
  }
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="font-display text-2xl">Your lists</h2>
      <p className="mt-1 text-xs text-muted">Make a list, then select books above and choose “Add to list”. Public lists get their own page to share.</p>
      <form
        className="mt-3 flex flex-wrap gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) void send("POST", { title }).then(() => setTitle(""));
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cozy mysteries for a rainy week" className="min-w-64 flex-1 border border-line px-2 py-1.5" />
        <button type="submit" className="bg-accent px-3 py-1.5 text-paper">
          New list
        </button>
      </form>
      {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
      <ul className="mt-4 space-y-4">
        {lists.map((l) => (
          <li key={l.id} className="border border-line p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-display text-lg">{l.title}</span>
              <span className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={l.public} onChange={(e) => void send("PATCH", { id: l.id, public: e.target.checked })} /> Public
                </label>
                {l.public && (
                  <a href={`/lists/${l.id}`} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                    View page
                  </a>
                )}
                <button type="button" className="text-danger underline" onClick={() => window.confirm(`Delete “${l.title}”?`) && void send("DELETE", { id: l.id })}>
                  Delete
                </button>
              </span>
            </div>
            <textarea
              defaultValue={l.description}
              placeholder="What's this list about? (optional)"
              rows={2}
              onBlur={(e) => e.target.value !== l.description && void send("PATCH", { id: l.id, description: e.target.value })}
              className="mt-2 w-full border border-line px-2 py-1 text-xs"
            />
            {l.items.length === 0 ? (
              <p className="mt-1 text-xs text-muted">No books yet.</p>
            ) : (
              <ol className="mt-2 space-y-1.5">
                {l.items.map((it, i) => (
                  <li key={it.projectId} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="w-5 text-muted">{i + 1}.</span>
                    <span className="font-display text-sm">{it.title}</span>
                    <input
                      defaultValue={it.note}
                      placeholder="A note on why (optional)"
                      onBlur={(e) => e.target.value !== it.note && void send("PATCH", { id: l.id, note: { projectId: it.projectId, text: e.target.value } })}
                      className="min-w-48 flex-1 border border-line px-2 py-0.5"
                    />
                    <button type="button" className="text-muted underline" onClick={() => void send("PATCH", { id: l.id, removeProjectId: it.projectId })}>
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SharingAndFilters() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [filterText, setFilterText] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/library/prefs")
      .then(async (r) => {
        if (!r.ok) return;
        const p = (await r.json()) as Prefs;
        setPrefs(p);
        setFilterText(p.contentFilters.join(", "));
      })
      .catch(() => null);
  }, []);
  async function save(patch: Partial<Prefs>, done: string) {
    const res = await fetch("/api/library/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setSaved(res.ok ? done : "Could not save");
    if (res.ok) setPrefs((p) => (p ? { ...p, ...patch } : p));
  }
  if (!prefs) return null;
  return (
    <section className="mt-12 border-t border-line pt-8 text-sm">
      <h2 className="font-display text-2xl">Sharing and filters</h2>
      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={prefs.libraryPublic} onChange={(e) => void save({ libraryPublic: e.target.checked }, e.target.checked ? "Your loved books are now shared." : "Your shelves are private.")} />
        <span>
          Share the books I loved
          <span className="block text-xs text-muted">
            Shows finished books you rated 4 or 5 stars (or didn&apos;t rate) that are published here on your public reader profile, and lets readers with
            similar taste find you. Your other shelves, imports, and anything you wrote in a book stay private. Off by default.
            {prefs.libraryPublic && !prefs.profilePublic && " Turn on your public reader profile on the reader dashboard for others to see it."}
            {prefs.libraryPublic && prefs.profilePublic && prefs.handle && (
              <>
                {" "}
                <Link href={`/r/${prefs.handle}`} className="text-accent underline">
                  See your profile
                </Link>
              </>
            )}
          </span>
        </span>
      </label>
      <div className="mt-5">
        <label htmlFor="content-filters" className="block">
          Content filters
        </label>
        <p className="text-xs text-muted">Words or phrases to skip, separated by commas, like a trope or a content warning. Matching books are left out of your recommendations.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input id="content-filters" value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="e.g. love triangle, animal death" className="min-w-64 flex-1 border border-line px-2 py-1.5" />
          <button
            type="button"
            className="border border-line px-3 py-1.5"
            onClick={() => {
              const list = filterText.split(",").map((s) => s.trim()).filter(Boolean);
              void save({ contentFilters: list }, list.length ? "Filters saved." : "Filters cleared.");
            }}
          >
            Save filters
          </button>
        </div>
      </div>
      {saved && <p className="mt-2 text-accent">{saved}</p>}
    </section>
  );
}

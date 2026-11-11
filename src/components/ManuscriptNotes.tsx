"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Note = { id: string; chapterId: string; excerpt: string; body: string; resolved: boolean; at: string };
type Data = {
  role: "author" | "pro";
  canNote: boolean;
  chapters: { id: string; title: string; notes: number }[];
  chapter: { id: string; title: string; html: string } | null;
  notes: Note[];
  migrationNeeded?: boolean;
  error?: string;
};

/**
 * Editor notes pinned to passages. The editor reads the book here (read-only), selects a passage, and notes it;
 * the author goes through the notes chapter by chapter and marks each one done.
 */
export function ManuscriptNotes({ jobId }: { jobId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pane = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (ch?: string | null) => {
      const r = await fetch(`/api/market/jobs/${jobId}/notes${ch ? `?chapterId=${ch}` : ""}`).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!r?.ok) return setError(j.error || "Couldn't load the notes");
      setD(j);
      if (j.chapter) setChapterId(j.chapter.id);
    },
    [jobId]
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/market/jobs/${jobId}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(j.error || "Something went wrong");
      return false;
    }
    await load(chapterId);
    return true;
  }

  // A selection inside the chapter becomes the passage the note is pinned to
  function captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !pane.current?.contains(sel.anchorNode)) return;
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (text) setExcerpt(text.slice(0, 500));
  }

  if (error && !d) return <p className="mt-6 text-sm text-danger">{error}</p>;
  if (!d) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  if (d.migrationNeeded) return <p className="mt-6 text-sm text-danger">{d.error}</p>;

  const notesFor = (id: string) => d.notes.filter((n) => n.chapterId === id);

  if (d.role === "author") {
    const open = d.notes.filter((n) => !n.resolved).length;
    return (
      <div className="mt-4 space-y-6 text-sm">
        <p className="text-muted">
          {d.notes.length ? `${d.notes.length} ${d.notes.length === 1 ? "note" : "notes"} from your editor, ${open} still open.` : "No notes from your editor yet."} Make the changes in your book, then tick each
          note off.
        </p>
        {d.chapters
          .filter((c) => notesFor(c.id).length)
          .map((c) => (
            <section key={c.id}>
              <h2 className="font-display border-b border-line pb-1 text-xl">{c.title}</h2>
              <ul className="mt-2 space-y-2">
                {notesFor(c.id).map((n) => (
                  <li key={n.id} className={`border px-3 py-2 ${n.resolved ? "border-line opacity-60" : "border-accent/40"}`}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={n.resolved} disabled={busy} onChange={(e) => void post({ action: "resolve", noteId: n.id, resolved: e.target.checked })} />
                      <span className="min-w-0 flex-1">
                        {n.excerpt && <span className="block border-l-2 border-line pl-2 italic text-muted">“{n.excerpt}”</span>}
                        <span className="mt-1 block whitespace-pre-wrap">{n.body}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        {error && <p className="text-danger">{error}</p>}
      </div>
    );
  }

  if (!d.chapter) return <p className="mt-6 text-sm text-muted">The manuscript opens here once the author pays the first milestone.</p>;
  return (
    <div className="mt-4 grid gap-6 text-sm md:grid-cols-[12rem_minmax(0,1fr)_16rem]">
      <nav className="space-y-1 md:sticky md:top-4 md:self-start" aria-label="Chapters">
        <select className="w-full border border-line bg-paper px-2 py-1.5 md:hidden" value={chapterId || ""} onChange={(e) => void load(e.target.value)}>
          {d.chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
              {c.notes ? ` (${c.notes})` : ""}
            </option>
          ))}
        </select>
        <ul className="hidden space-y-1 md:block">
          {d.chapters.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => void load(c.id)} className={`w-full truncate text-left ${c.id === chapterId ? "text-accent" : "text-muted hover:text-ink"}`}>
                {c.title}
                {c.notes ? ` · ${c.notes}` : ""}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <article ref={pane} onMouseUp={captureSelection} onTouchEnd={captureSelection} className="book-body min-w-0 leading-relaxed">
        <h2 className="font-display mb-4 text-2xl">{d.chapter.title}</h2>
        <div dangerouslySetInnerHTML={{ __html: d.chapter.html }} />
      </article>
      <aside className="space-y-3 md:sticky md:top-4 md:self-start">
        {d.canNote && (
          <form
            className="space-y-2 border border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void post({ action: "add", chapterId, excerpt, body }).then((ok) => {
                if (ok) {
                  setBody("");
                  setExcerpt("");
                }
              });
            }}
          >
            <p className="text-xs text-muted">Select a passage in the chapter, then write your note.</p>
            {excerpt && (
              <p className="border-l-2 border-accent pl-2 text-xs italic">
                “{excerpt}”{" "}
                <button type="button" className="not-italic text-muted underline" onClick={() => setExcerpt("")}>
                  clear
                </button>
              </p>
            )}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="block w-full border border-line bg-paper px-2 py-1.5" placeholder="Your note" />
            <button type="submit" disabled={busy || !body.trim()} className="bg-accent px-3 py-1.5 text-paper disabled:opacity-50">
              Add note
            </button>
          </form>
        )}
        <ul className="space-y-2">
          {notesFor(d.chapter.id).map((n) => (
            <li key={n.id} className={`border px-2 py-1.5 text-xs ${n.resolved ? "border-line opacity-60" : "border-accent/40"}`}>
              {n.excerpt && <p className="italic text-muted">“{n.excerpt}”</p>}
              <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-[11px] text-muted">
                {n.resolved ? "Done by the author" : "Open"}
                {!n.resolved && (
                  <>
                    {" · "}
                    <button type="button" className="underline" disabled={busy} onClick={() => void post({ action: "delete", noteId: n.id })}>
                      delete
                    </button>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
        {error && <p className="text-xs text-danger">{error}</p>}
      </aside>
    </div>
  );
}

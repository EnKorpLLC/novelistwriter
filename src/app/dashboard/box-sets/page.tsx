"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { coverPublicUrl } from "@/lib/cover";
import { BOOK_STYLES } from "@/lib/book/styles";
import { prepareCoverUpload } from "@/lib/book/cover-template";

type BoxSet = { id: string; title: string; subtitle: string; project_ids: string[]; style: string; cover_path: string | null };
type ProjectLite = { id: string; title: string; word_count: number | null };

export default function BoxSetsPage() {
  const [studio, setStudio] = useState<boolean | null>(null);
  const [sets, setSets] = useState<BoxSet[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addPick, setAddPick] = useState("");

  useEffect(() => {
    void fetch("/api/box-sets")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Could not load");
        setStudio(json.studio);
        setSets(json.sets);
        setProjects(json.projects);
        if (json.migrationNeeded) setNote("Database needs an update. Run supabase/migration_formatting.sql in the Supabase SQL editor.");
        if (json.sets[0]) setActiveId(json.sets[0].id);
      })
      .catch((err) => setNote(err instanceof Error ? err.message : "Could not load"));
  }, []);

  const active = sets.find((s) => s.id === activeId) || null;
  const titleOf = (id: string) => projects.find((p) => p.id === id)?.title || "Untitled";
  const words = active ? active.project_ids.reduce((n, id) => n + (projects.find((p) => p.id === id)?.word_count || 0), 0) : 0;

  async function patch(id: string, body: Partial<BoxSet>) {
    setSets((list) => list.map((s) => (s.id === id ? { ...s, ...body } : s)));
    const res = await fetch(`/api/box-sets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setNote(json.error || "Could not save");
    else if (json.set) setSets((list) => list.map((s) => (s.id === id ? json.set : s)));
  }

  async function create() {
    setNote(null);
    const res = await fetch("/api/box-sets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "My box set" }) });
    const json = await res.json();
    if (!res.ok) {
      setNote(json.error || "Could not create the box set");
      return;
    }
    setSets((list) => [json.set, ...list]);
    setActiveId(json.set.id);
  }

  async function remove(set: BoxSet) {
    if (!window.confirm(`Delete "${set.title}"? Your books aren't touched.`)) return;
    setSets((list) => list.filter((s) => s.id !== set.id));
    setActiveId(null);
    await fetch(`/api/box-sets/${set.id}`, { method: "DELETE" });
  }

  function moveBook(i: number, dir: -1 | 1) {
    if (!active) return;
    const ids = [...active.project_ids];
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void patch(active.id, { project_ids: ids });
  }

  async function uploadCover(file: File) {
    if (!active) return;
    setBusy("cover");
    setNote(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to upload.");
      const ready = await prepareCoverUpload(file, 5 * 1024 * 1024);
      const path = `${user.id}/boxsets/${active.id}-${Date.now().toString(36)}.${ready.type === "image/png" ? "png" : "jpg"}`;
      const { error } = await supabase.storage.from("covers").upload(path, ready, { contentType: ready.type, upsert: true });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      const old = active.cover_path;
      await patch(active.id, { cover_path: path });
      if (old) void supabase.storage.from("covers").remove([old]);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function downloadEpub() {
    if (!active) return;
    setBusy("epub");
    setNote(null);
    try {
      const res = await fetch(`/api/box-sets/${active.id}/epub`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not build the ebook");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "box-set.epub";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not build the ebook");
    } finally {
      setBusy(null);
    }
  }

  const input = "mt-1 block w-full border border-line bg-paper px-3 py-2 text-sm text-ink";

  return (
    <div className="font-ui mx-auto min-h-screen max-w-5xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-accent hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-3 text-3xl">Box sets</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Bundle books into one ebook or paperback. Each book gets its own divider page, chapter numbers start again for
        every book, and one contents page lists them all.
      </p>
      {note && <p className="mt-3 text-sm text-danger">{note}</p>}

      {studio === false && (
        <div className="mt-6 border border-accent/40 bg-accent/5 p-4 text-sm">
          <p className="text-ink">Box sets are part of Studio.</p>
          <a href="/billing" className="mt-3 inline-block bg-accent px-4 py-2 text-paper">
            Get Studio
          </a>
        </div>
      )}

      {studio && (
        <div className="mt-8 grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <button type="button" onClick={() => void create()} className="w-full bg-accent px-3 py-2 text-sm text-paper">
              New box set
            </button>
            {sets.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={`block w-full truncate border px-3 py-2 text-left text-sm ${s.id === activeId ? "border-accent bg-accent/5" : "border-line"}`}
              >
                {s.title || "Untitled box set"}
                <span className="block text-xs text-muted">
                  {s.project_ids.length} book{s.project_ids.length === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>

          {active ? (
            <div className="space-y-6">
              <section className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <div className="space-y-3">
                  <label className="block text-xs text-muted">
                    Title
                    <input
                      defaultValue={active.title}
                      key={`t-${active.id}`}
                      onBlur={(e) => e.target.value !== active.title && void patch(active.id, { title: e.target.value })}
                      className={input}
                    />
                  </label>
                  <label className="block text-xs text-muted">
                    Subtitle
                    <input
                      defaultValue={active.subtitle}
                      key={`s-${active.id}`}
                      placeholder="Books 1–3 of the Tower Saga"
                      onBlur={(e) => e.target.value !== active.subtitle && void patch(active.id, { subtitle: e.target.value })}
                      className={input}
                    />
                  </label>
                  <label className="block text-xs text-muted">
                    Book style
                    <select value={active.style} onChange={(e) => void patch(active.id, { style: e.target.value })} className={input}>
                      {BOOK_STYLES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <div className="h-48 w-32 overflow-hidden border border-line bg-paper-deep">
                    {active.cover_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverPublicUrl(active.cover_path) || ""} alt="Box set cover" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">No cover</div>
                    )}
                  </div>
                  <label className="mt-2 inline-block cursor-pointer border border-line px-2 py-1 text-xs hover:border-accent">
                    {busy === "cover" ? "Uploading…" : active.cover_path ? "Replace cover" : "Upload cover"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={!!busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void uploadCover(f);
                      }}
                    />
                  </label>
                </div>
              </section>

              <section>
                <h2 className="font-display text-xl">Books in this set</h2>
                <ol className="mt-3 space-y-2">
                  {active.project_ids.map((id, i) => (
                    <li key={id} className="flex items-center justify-between gap-3 border border-line px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="text-muted">Book {i + 1}:</span> {titleOf(id)}
                      </span>
                      <span className="flex shrink-0 gap-2 text-xs">
                        <button type="button" disabled={i === 0} onClick={() => moveBook(i, -1)} className="disabled:opacity-30" aria-label="Move up">
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={i === active.project_ids.length - 1}
                          onClick={() => moveBook(i, 1)}
                          className="disabled:opacity-30"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="text-danger"
                          onClick={() => void patch(active.id, { project_ids: active.project_ids.filter((x) => x !== id) })}
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select value={addPick} onChange={(e) => setAddPick(e.target.value)} className="border border-line bg-paper px-2 py-1.5 text-sm">
                    <option value="">Add a book…</option>
                    {projects
                      .filter((p) => !active.project_ids.includes(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title || "Untitled"}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!addPick}
                    onClick={() => {
                      void patch(active.id, { project_ids: [...active.project_ids, addPick] });
                      setAddPick("");
                    }}
                    className="border border-line px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {words.toLocaleString()} words. The copyright, contents, and back pages come from the first book; each
                  book&apos;s dedication and sample chapters are left out.
                </p>
              </section>

              <section className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!active.project_ids.length || !!busy}
                  onClick={() => void downloadEpub()}
                  className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
                >
                  {busy === "epub" ? "Building…" : "Download ebook (EPUB)"}
                </button>
                {active.project_ids.length > 0 && (
                  <a href={`/dashboard/box-sets/${active.id}/print`} className="border border-accent px-4 py-2 text-sm text-accent">
                    Open print layout
                  </a>
                )}
                <button type="button" onClick={() => void remove(active)} className="ml-auto text-sm text-danger">
                  Delete box set
                </button>
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted">Create a box set to start.</p>
          )}
        </div>
      )}
    </div>
  );
}

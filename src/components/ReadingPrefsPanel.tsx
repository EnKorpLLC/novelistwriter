"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GENRE_CHOICES, NO_PREFS, WARNING_CHOICES, hasPrefs, type Choice, type ReadingPrefs } from "@/lib/reading-prefs";

function Chips({
  choices,
  picked,
  blocked,
  tone,
  onToggle,
}: {
  choices: Choice[];
  picked: string[];
  blocked?: string[];
  tone: "want" | "avoid";
  onToggle: (id: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {choices.map((c) => {
        const on = picked.includes(c.id);
        const off = !on && blocked?.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            disabled={off}
            onClick={() => onToggle(c.id)}
            className={`border px-2.5 py-1 text-xs transition disabled:opacity-35 ${
              on
                ? tone === "want"
                  ? "border-accent bg-accent text-paper"
                  : "border-danger bg-danger/10 text-danger"
                : "border-line text-muted hover:border-accent hover:text-ink"
            }`}
          >
            {on ? (tone === "want" ? "✓ " : "✕ ") : ""}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/** Genres to read, genres to skip, and content warnings to skip. They filter betas, ARCs, and books for sale. */
export function ReadingPrefsPanel({ hidden, onSaved }: { hidden?: { betas: number; arcs: number } | null; onSaved: () => void }) {
  const [prefs, setPrefs] = useState<ReadingPrefs>(NO_PREFS);
  const [saved, setSaved] = useState<ReadingPrefs>(NO_PREFS);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/library/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.readingPrefs) return;
        setPrefs(d.readingPrefs);
        setSaved(d.readingPrefs);
      });
  }, []);

  const toggle = (key: keyof ReadingPrefs, id: string) =>
    setPrefs((p) => ({ ...p, [key]: p[key].includes(id) ? p[key].filter((x) => x !== id) : [...p[key], id] }));

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/library/prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingPrefs: prefs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      setPrefs(data.readingPrefs || prefs);
      setSaved(data.readingPrefs || prefs);
      setMsg("Saved. Your lists now follow these choices.");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const changed = JSON.stringify(prefs) !== JSON.stringify(saved);
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const summary = hasPrefs(saved)
    ? [
        saved.likeGenres.length ? count(saved.likeGenres.length, "genre") + " wanted" : null,
        saved.avoidGenres.length ? count(saved.avoidGenres.length, "genre") + " skipped" : null,
        saved.avoidWarnings.length ? count(saved.avoidWarnings.length, "content warning") + " skipped" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Nothing set: you see every genre";
  const hiddenTotal = (hidden?.betas || 0) + (hidden?.arcs || 0);

  return (
    <section id="reading-prefs" className="font-ui mb-10 scroll-mt-24 border border-line p-4">
      <button type="button" className="flex w-full items-baseline justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>
          <span className="font-display block text-lg text-ink">Reading preferences</span>
          <span className="mt-0.5 block text-xs text-muted">
            {summary}
            {hiddenTotal > 0 ? ` · ${hiddenTotal} hidden here` : ""}
          </span>
        </span>
        <span className="shrink-0 text-xs text-accent">{open ? "Close" : "Change"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5 text-sm">
          <p className="text-xs text-muted">
            These choices filter the beta reads and advance copies here and the books for sale in the store. Books are matched on the genre,
            tropes, and content warnings their authors list, so a book with no warnings listed can still show.
          </p>
          <div>
            <p className="text-ink">Genres I want to read</p>
            <p className="text-xs text-muted">Pick any to see only these. Leave all off to see every genre.</p>
            <Chips choices={GENRE_CHOICES} picked={prefs.likeGenres} blocked={prefs.avoidGenres} tone="want" onToggle={(id) => toggle("likeGenres", id)} />
          </div>
          <div>
            <p className="text-ink">Genres I don&apos;t want to read</p>
            <Chips choices={GENRE_CHOICES} picked={prefs.avoidGenres} blocked={prefs.likeGenres} tone="avoid" onToggle={(id) => toggle("avoidGenres", id)} />
          </div>
          <div>
            <p className="text-ink">Content warnings I don&apos;t want to see</p>
            <Chips choices={WARNING_CHOICES} picked={prefs.avoidWarnings} tone="avoid" onToggle={(id) => toggle("avoidWarnings", id)} />
          </div>
          <p className="text-xs text-muted">
            Want to skip a particular word or trope too? Add it to your{" "}
            <Link href="/library" className="text-accent underline">
              content filters
            </Link>{" "}
            in your library.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || !changed} onClick={() => void save()} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50">
              {busy ? "Saving…" : "Save preferences"}
            </button>
            {hasPrefs(prefs) && (
              <button type="button" className="text-xs text-muted underline" onClick={() => setPrefs(NO_PREFS)}>
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
      {msg && <p className="mt-3 text-xs text-muted">{msg}</p>}
    </section>
  );
}

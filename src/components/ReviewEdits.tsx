"use client";

import { useEffect, useMemo, useState } from "react";

type Segment = { t: "same" | "del" | "ins"; s: string };
type Change = { id: string; kind: "change" | "insert" | "delete"; before: string; after: string; diff: Segment[] };
type Chapter = { chapterId: string; title: string; matched: boolean; changes: Change[] };
type Data = { fileName: string; jobTitle: string; basis: string; chapters: Chapter[] };

const KIND = { change: "Changed", insert: "Added", delete: "Removed" };

/** The author goes through an editor's Word file, change by change; only accepted changes reach the book. */
export function ReviewEdits({ jobId, fileId }: { jobId: string; fileId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Every change starts accepted, as in Word's "accept all"; untick what you don't want
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/market/jobs/${jobId}/review/${fileId}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Couldn't open the edits");
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't open the edits"));
  }, [jobId, fileId]);

  const all = useMemo(() => (data?.chapters || []).flatMap((c) => c.changes), [data]);
  const toggle = (ids: string[], reject: boolean) =>
    setRejected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (reject) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  async function apply() {
    if (!data) return;
    const accept = all.filter((c) => !rejected.has(c.id)).map((c) => c.id);
    if (!window.confirm(`Apply ${accept.length} of ${all.length} changes to your book? A version of each changed chapter is saved first, so you can go back.`)) return;
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/market/jobs/${jobId}/review/${fileId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ basis: data.basis, accept }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error || "Couldn't apply the changes");
    setDone(`Applied ${d.accepted} changes (${d.rejected} left out). Earlier text is saved as the version “${d.label}”.`);
  }

  if (error && !data) return <p className="mt-6 text-sm text-danger">{error}</p>;
  if (!data) return <p className="mt-6 text-sm text-muted">Reading the editor&apos;s file…</p>;
  if (done) {
    return (
      <div className="mt-6 space-y-3 text-sm">
        <p className="text-accent">{done}</p>
        <a href={`/hire/job/${jobId}`} className="text-accent underline">
          Back to the job
        </a>
      </div>
    );
  }
  const unmatched = data.chapters.filter((c) => !c.matched);
  const kept = all.length - rejected.size;

  return (
    <div className="mt-4 space-y-6 text-sm">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted">Review edits</p>
        <h1 className="font-display mt-1 text-3xl">{data.jobTitle}</h1>
        <p className="mt-1 text-muted">
          {data.fileName}: {all.length} changed {all.length === 1 ? "paragraph" : "paragraphs"}. Everything starts accepted; untick what you&apos;d rather keep as
          it was. Comments in the Word file don&apos;t show here, so open it in Word to read them.
        </p>
        {unmatched.length > 0 && (
          <p className="mt-2 text-danger">
            {unmatched.length} {unmatched.length === 1 ? "chapter" : "chapters"} couldn&apos;t be matched (a chapter heading was changed or removed):{" "}
            {unmatched.map((c) => c.title).join(", ")}.
          </p>
        )}
      </header>

      {data.chapters
        .filter((c) => c.changes.length)
        .map((c) => {
          const ids = c.changes.map((x) => x.id);
          const allOff = ids.every((id) => rejected.has(id));
          return (
            <section key={c.chapterId}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-1">
                <h2 className="font-display text-xl">{c.title}</h2>
                <button type="button" className="text-xs text-accent underline" onClick={() => toggle(ids, !allOff)}>
                  {allOff ? "Accept all in this chapter" : "Reject all in this chapter"}
                </button>
              </div>
              <ul className="mt-2 space-y-2">
                {c.changes.map((x) => {
                  const on = !rejected.has(x.id);
                  return (
                    <li key={x.id} className={`border px-3 py-2 ${on ? "border-accent/40" : "border-line opacity-60"}`}>
                      <label className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1" checked={on} onChange={(e) => toggle([x.id], !e.target.checked)} />
                        <span className="min-w-0 flex-1">
                          <span className="text-[11px] uppercase tracking-wide text-muted">{KIND[x.kind]}</span>
                          <span className="block leading-relaxed">
                            {x.diff.map((s, i) =>
                              s.t === "same" ? (
                                <span key={i}>{s.s} </span>
                              ) : s.t === "del" ? (
                                <del key={i} className="bg-danger/10 text-danger">
                                  {s.s}
                                </del>
                              ) : (
                                <ins key={i} className="bg-accent/10 text-accent no-underline">
                                  {s.s}{" "}
                                </ins>
                              )
                            )}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

      {all.length === 0 ? (
        <p className="text-muted">No changes found against your book as it is now.</p>
      ) : (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-paper py-3">
          <button type="button" disabled={busy || kept === 0} className="bg-accent px-4 py-2 text-paper disabled:opacity-50" onClick={() => void apply()}>
            {busy ? "Applying…" : `Apply ${kept} ${kept === 1 ? "change" : "changes"} to my book`}
          </button>
          <button type="button" className="text-xs text-muted underline" onClick={() => toggle(all.map((x) => x.id), rejected.size < all.length)}>
            {rejected.size < all.length ? "Reject everything" : "Accept everything"}
          </button>
          {error && <span className="text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
}

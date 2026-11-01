"use client";

import { useState } from "react";

/** Download beta comments, final reviews, DNF reasons, and ARC reviews as a Word document. */
export function FeedbackExport({
  projectId,
  chapters,
  defaultBeta = true,
  defaultArc = true,
}: {
  projectId: string;
  /** Omit to hide chapter picking (the ARC panel) */
  chapters?: { id: string; title: string }[];
  defaultBeta?: boolean;
  defaultArc?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [beta, setBeta] = useState(defaultBeta);
  const [arc, setArc] = useState(defaultArc);
  const [reviewsOnly, setReviewsOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [pickChapters, setPickChapters] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commentsIncluded = beta && !reviewsOnly;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        beta: beta ? "1" : "0",
        arc: arc ? "1" : "0",
        reviewsOnly: reviewsOnly ? "1" : "0",
        openOnly: openOnly ? "1" : "0",
      });
      if (commentsIncluded && pickChapters && picked.size) params.set("chapters", [...picked].join(","));
      const res = await fetch(`/api/projects/${projectId}/feedback/export?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not build the document");
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "reader feedback.docx";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the document");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="font-ui border border-line p-4">
      <button
        type="button"
        className="flex w-full items-baseline justify-between gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>
          <span className="font-display block text-lg text-ink">Export feedback</span>
          <span className="text-xs text-muted">
            Comments, replies, final reviews, DNF reasons, and ARC reviews as a Word document to keep open
            while you revise.
          </span>
        </span>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={beta} onChange={(e) => setBeta(e.target.checked)} />
              Beta feedback
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={arc} onChange={(e) => setArc(e.target.checked)} />
              ARC reviews
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={reviewsOnly} onChange={(e) => setReviewsOnly(e.target.checked)} />
            Reviews only (beta final reviews and ARC reviews, no comments)
          </label>
          <label className={`flex items-center gap-2 ${commentsIncluded ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              checked={openOnly}
              disabled={!commentsIncluded}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
            Unresolved comments only
          </label>
          {chapters && chapters.length > 0 && (
            <div className={commentsIncluded ? "" : "opacity-50"}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pickChapters}
                  disabled={!commentsIncluded}
                  onChange={(e) => setPickChapters(e.target.checked)}
                />
                Only some chapters
              </label>
              {pickChapters && commentsIncluded && (
                <div className="mt-2 max-h-56 overflow-y-auto border border-line p-2">
                  <div className="mb-2 flex gap-3 text-xs">
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      onClick={() => setPicked(new Set([...chapters.map((c) => c.id), "general"]))}
                    >
                      Select all
                    </button>
                    <button type="button" className="text-accent hover:underline" onClick={() => setPicked(new Set())}>
                      Clear
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {chapters.map((c, i) => (
                      <li key={c.id}>
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                          {i + 1}. {c.title || "Untitled"}
                        </label>
                      </li>
                    ))}
                    <li>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={picked.has("general")} onChange={() => toggle("general")} />
                        General comments (not tied to a chapter)
                      </label>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="button"
            disabled={busy || (!beta && !arc) || (commentsIncluded && pickChapters && picked.size === 0)}
            className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-40"
            onClick={() => void download()}
          >
            {busy ? "Building…" : "Download Word document"}
          </button>
          <p className="text-xs text-muted">Opens in Word, Google Docs, Pages, or LibreOffice.</p>
        </div>
      )}
    </section>
  );
}

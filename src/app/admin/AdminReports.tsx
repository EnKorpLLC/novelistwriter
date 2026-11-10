"use client";

import { useCallback, useEffect, useState } from "react";

type Report = {
  id: string;
  kind: "ai_concern" | "conduct" | "content";
  reason: string;
  details: string;
  status: "open" | "reviewed" | "dismissed" | "actioned";
  adminNote: string;
  createdAt: string;
  book: { id: string; title: string } | null;
  target: { id: string; name: string; email: string | null; handle: string | null; suspended: boolean } | null;
  reporter: string;
  conductReporters: number;
  record: {
    typedPercent: number;
    sessions: number;
    spanDays: number;
    recordedWords: number;
    importedWords: number;
    beforeRecordsWords: number;
    badge: string | null;
    flaggedSessions: number;
  } | null;
};

const KIND = { ai_concern: "How it was written", conduct: "Conduct", content: "Content" };

/** Private reports from readers and visitors. Nothing here is ever shown publicly. */
export function AdminReports({ onNote }: { onNote: (msg: string | null) => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [flagAt, setFlagAt] = useState(3);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [show, setShow] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reports");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      onNote(json.error || "Could not load reports");
      setReports([]);
      return;
    }
    setReports(json.reports);
    setFlagAt(json.flagAt);
  }, [onNote]);
  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>, done: string) {
    const res = await fetch("/api/admin/reports", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    onNote(res.ok ? done : json.error || "Could not update");
    await load();
  }

  if (!reports) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  const list = show === "open" ? reports.filter((r) => r.status === "open") : reports;

  return (
    <div className="mt-6 space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-muted">
          Private reports. Authors are never told who reported them, and books are never flagged publicly. For concerns about how a
          book was written, start with its writing record. Authors reported for conduct by {flagAt} or more people are marked for review.
        </p>
        <div className="flex gap-2 text-xs">
          {(["open", "all"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setShow(s)} className={`border px-3 py-1.5 ${show === s ? "border-accent text-ink" : "border-line text-muted"}`}>
              {s === "open" ? `Open (${reports.filter((r) => r.status === "open").length})` : "All"}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 && <p className="text-muted">Nothing to review.</p>}
      <ul className="space-y-3">
        {list.map((r) => (
          <li key={r.id} className={`border p-4 ${r.conductReporters >= flagAt ? "border-danger/50" : "border-line"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <span className="text-xs uppercase tracking-wide text-accent">{KIND[r.kind]}</span> · {r.reason}
              </span>
              <span className="text-xs text-muted">
                {new Date(r.createdAt).toLocaleDateString()} · {r.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {r.book ? `Book: ${r.book.title} · ` : ""}
              {r.target ? `Author: ${r.target.name}${r.target.email ? ` (${r.target.email})` : ""}` : ""}
              {r.target?.suspended ? " · removed from the reader catalog" : ""} · Reported by {r.reporter}
            </p>
            {r.details && <p className="mt-2 whitespace-pre-wrap">{r.details}</p>}
            {r.conductReporters > 0 && (
              <p className={`mt-2 text-xs ${r.conductReporters >= flagAt ? "text-danger" : "text-muted"}`}>
                {r.conductReporters} {r.conductReporters === 1 ? "person has" : "different people have"} reported this author&apos;s conduct.
              </p>
            )}
            {r.record && (
              <p className="mt-2 border-l-2 border-accent pl-3 text-xs">
                Writing record: {r.record.typedPercent}% typed, {r.record.sessions} sessions over {r.record.spanDays} days,{" "}
                {r.record.recordedWords.toLocaleString()} words written here
                {r.record.importedWords ? `, ${r.record.importedWords.toLocaleString()} imported` : ""}
                {r.record.beforeRecordsWords ? `, ${r.record.beforeRecordsWords.toLocaleString()} before records` : ""}
                {r.record.flaggedSessions ? `, ${r.record.flaggedSessions} flagged sessions` : ""}
                {r.record.badge === "written_here" ? ". Meets the Written in Novelist Writer standard." : "."}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={notes[r.id] ?? r.adminNote}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Private note"
                className="min-w-56 flex-1 border border-line bg-paper px-2 py-1.5"
              />
              {r.status === "open" ? (
                <>
                  <button type="button" className="border border-line px-3 py-1.5" onClick={() => void patch({ id: r.id, status: "reviewed", note: notes[r.id] ?? r.adminNote }, "Marked reviewed.")}>
                    Reviewed
                  </button>
                  <button type="button" className="border border-line px-3 py-1.5" onClick={() => void patch({ id: r.id, status: "actioned", note: notes[r.id] ?? r.adminNote }, "Marked as acted on.")}>
                    Acted on
                  </button>
                  <button type="button" className="text-muted underline" onClick={() => void patch({ id: r.id, status: "dismissed", note: notes[r.id] ?? r.adminNote }, "Dismissed.")}>
                    Dismiss
                  </button>
                </>
              ) : (
                <button type="button" className="text-muted underline" onClick={() => void patch({ id: r.id, status: "open" }, "Reopened.")}>
                  Reopen
                </button>
              )}
              {r.target &&
                (r.target.suspended ? (
                  <button type="button" className="text-accent underline" onClick={() => void patch({ userId: r.target!.id, suspend: false }, `${r.target!.name} is back in the reader catalog.`)}>
                    Restore to catalog
                  </button>
                ) : (
                  r.kind === "conduct" && (
                    <button
                      type="button"
                      className="bg-danger px-3 py-1.5 text-paper"
                      onClick={() =>
                        window.confirm(`Remove ${r.target!.name}'s books from the reader catalog? They'll be told, and readers already working with them aren't affected.`) &&
                        void patch({ userId: r.target!.id, suspend: true }, `${r.target!.name} was removed from the reader catalog.`)
                      }
                    >
                      Remove from catalog
                    </button>
                  )
                ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

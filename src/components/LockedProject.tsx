"use client";

import Link from "next/link";
import { useState } from "react";
import { saveAs } from "file-saver";

/** Export-only view of a project locked on the Free plan. */
export function LockedProject({
  projectId,
  title,
  bankDays,
}: {
  projectId: string;
  title: string;
  bankDays: number;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function exportAs(format: "docx" | "epub") {
    setBusy(format);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, includeChapterIds: [] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed");
      }
      saveAs(await res.blob(), `${title || "manuscript"}.${format}`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function startPass() {
    setBusy("pass");
    setNote(null);
    try {
      const res = await fetch("/api/studio-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start your pass");
      window.location.reload();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not start your pass");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <Link href="/dashboard" className="font-ui text-sm text-accent">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-6 text-3xl">{title}</h1>
      <div className="font-ui mt-6 border border-line bg-paper-deep/40 p-5 text-sm">
        <p className="text-ink">
          This project is locked because your account is on the Free plan, which keeps one project
          open (plus any you&apos;ve unlocked). Nothing is deleted, and you can export it anytime.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void exportAs("docx")}
            className="border border-line px-4 py-2 text-accent disabled:opacity-50"
          >
            {busy === "docx" ? "Building…" : "Export DOCX"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void exportAs("epub")}
            className="border border-line px-4 py-2 text-accent disabled:opacity-50"
          >
            {busy === "epub" ? "Building…" : "Export EPUB"}
          </button>
        </div>
        <p className="mt-6 text-ink">To edit it again:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/billing" className="bg-accent px-4 py-2 text-paper">
            Get Pro or Studio
          </Link>
          <Link href="/billing?unlock=1" className="border border-line px-4 py-2 text-accent">
            Unlock this project
          </Link>
          {bankDays > 0 ? (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void startPass()}
              className="border border-line px-4 py-2 text-accent disabled:opacity-50"
            >
              {busy === "pass" ? "Starting…" : `Start ${bankDays} banked Studio day${bankDays === 1 ? "" : "s"}`}
            </button>
          ) : (
            <Link href="/dashboard/share" className="border border-line px-4 py-2 text-accent">
              Earn free Studio days
            </Link>
          )}
        </div>
        {note && <p className="mt-3 text-danger">{note}</p>}
      </div>
    </div>
  );
}

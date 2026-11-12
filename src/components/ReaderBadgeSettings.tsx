"use client";

import { useEffect, useState } from "react";
import { CompactTrust, RecordSummaryLine, TrustBadges } from "@/components/TrustBadges";

export type ReaderBadgeBook = {
  projectId: string;
  noAiOnBook: boolean;
  aiActions: { label: string; count: number }[];
  aiDisclosurePublic: boolean;
  recordBadge: "written_here" | "before_records" | null;
  recordStats?: { typedPercent: number; sessions: number; activeDays: number };
  readerShowBadges: boolean;
  readerShowRecord: boolean;
};

/** The author's two per-book choices for Beta and ARC readers, with a preview of what readers get. */
export function ReaderBadgeToggles({
  book,
  aiOffSince,
  onChange,
  showPreview = false,
}: {
  book: ReaderBadgeBook;
  aiOffSince: string | null;
  onChange: (next: Partial<ReaderBadgeBook>) => void;
  showPreview?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { readerShowBadges?: boolean; readerShowRecord?: boolean }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/badges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: book.projectId, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      onChange(patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const trust = book.readerShowBadges
    ? {
        aiOffSince,
        noAiOnBook: book.noAiOnBook,
        aiActions: !book.noAiOnBook && book.aiDisclosurePublic ? book.aiActions : null,
      }
    : null;
  const stats = book.recordStats;
  const record =
    book.readerShowRecord && stats && (book.recordBadge || stats.sessions > 0)
      ? { badge: book.recordBadge, ...stats, recordHref: null }
      : null;
  const hasBadges = Boolean(aiOffSince || book.noAiOnBook || (book.aiDisclosurePublic && book.aiActions.length));

  return (
    <div className="font-ui space-y-2 text-xs">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={book.readerShowBadges}
          disabled={saving}
          onChange={(e) => void save({ readerShowBadges: e.target.checked })}
        />
        <span>
          <span className="text-ink">Show my AI badges to Beta and ARC readers</span>
          <span className="block text-muted">
            &ldquo;No AI used on this book,&rdquo; &ldquo;AI tools off,&rdquo; and the AI action list if you
            made it public.{!hasBadges && " This book has none to show right now."}
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={book.readerShowRecord}
          disabled={saving}
          onChange={(e) => void save({ readerShowRecord: e.target.checked })}
        />
        <span>
          <span className="text-ink">Show my writing record to readers</span>
          <span className="block text-muted">
            The share typed in the editor, writing sessions, days written, and your record badge (&ldquo;Written in
            Novelist Writer&rdquo; or &ldquo;Written before records&rdquo;). Shown on your launch page, beta and ARC listings,
            and reader pages. Never any of your text. This is the same switch as on the Launch page tab.
          </span>
        </span>
      </label>
      {error && <p className="text-danger">{error}</p>}
      {showPreview && (
        <div className="border border-line bg-paper-deep/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted">
            Readers see this on the Available tab, the book&apos;s reader pages, and the launch page
          </p>
          {trust || record ? (
            <div className="mt-2 space-y-2">
              <CompactTrust trust={trust} record={record} />
              {trust && <TrustBadges {...trust} />}
              <RecordSummaryLine record={record} />
            </div>
          ) : (
            <p className="mt-1 text-muted">Nothing: no badges or writing record are shown for this book.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Self-loading version for the Beta and ARC panels. */
export function ReaderBadgeSettings({ projectId }: { projectId: string }) {
  const [book, setBook] = useState<ReaderBadgeBook | null>(null);
  const [aiOffSince, setAiOffSince] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/profile/badges?projectId=${encodeURIComponent(projectId)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Could not load");
        setAiOffSince(json.aiOffSince || null);
        setBook((json.books || [])[0] || null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load"));
  }, [projectId]);

  return (
    <section className="font-ui border border-line p-4">
      <h3 className="font-display text-lg text-ink">What readers see</h3>
      <p className="mt-0.5 text-xs text-muted">
        Choose whether your badges and writing record appear on this book&apos;s listing in the readers&apos;
        Available tab and on its reader page. Also in Profile under Your badges.
      </p>
      <div className="mt-3">
        {error && <p className="text-xs text-danger">{error}</p>}
        {!book && !error && <p className="text-xs text-muted">Loading…</p>}
        {book && (
          <ReaderBadgeToggles
            book={book}
            aiOffSince={aiOffSince}
            showPreview
            onChange={(next) => setBook((b) => (b ? { ...b, ...next } : b))}
          />
        )}
      </div>
    </section>
  );
}

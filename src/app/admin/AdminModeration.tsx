"use client";

import { useCallback, useEffect, useState } from "react";

type Kind = "review" | "comment";

type ModItem = {
  id: string;
  projectId: string;
  bookTitle: string;
  bookListed: boolean;
  authorName: string;
  writtenBy: "author" | "reader";
  isReply: boolean;
  readerName: string | null;
  readerEmail: string | null;
  body: string;
  excerpt: string | null;
  createdAt: string;
};

type Filters = { book: string; author: string; from: string; to: string };

const EMPTY_FILTERS: Filters = { book: "", author: "", from: "", to: "" };
const PAGE_SIZES = [10, 25, 50] as const;

export function AdminModeration({ onNote }: { onNote: (msg: string | null) => void }) {
  const [kind, setKind] = useState<Kind>("review");
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ModItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ kind, page: String(page), pageSize: String(pageSize) });
      for (const [k, v] of Object.entries(filters)) if (v.trim()) params.set(k, v.trim());
      const res = await fetch(`/api/admin/moderation?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        onNote(data.error || "Could not load moderation list");
        return;
      }
      setItems(data.items || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [kind, page, pageSize, filters, onNote]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(total, page * pageSize);
  const filtered = Object.values(filters).some((v) => v.trim());

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setFilters(draft);
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  async function remove(item: ModItem) {
    const label = kind === "review" ? "review" : "comment";
    if (!window.confirm(`Delete this ${label} on "${item.bookTitle}"? This can't be undone.`)) return;
    const res = await fetch("/api/admin/moderation", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id: item.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      onNote(data.error || "Delete failed");
      return;
    }
    onNote(`${kind === "review" ? "Review" : "Comment"} deleted.`);
    // Step back a page if this emptied the last one
    if (items.length === 1 && page > 1) setPage(page - 1);
    else void load();
  }

  return (
    <section className="mt-6">
      <div className="flex flex-wrap gap-3 text-sm">
        {(["review", "comment"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={kind === k ? "text-ink underline" : "text-muted hover:text-ink"}
            onClick={() => {
              setKind(k);
              setPage(1);
            }}
          >
            {k === "review" ? "Finished-book reviews" : "Reader comments"}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {kind === "review"
          ? "Public on each book's beta page while the book is Ready."
          : "Private to the reader, the book's author, and you. Includes replies."}
      </p>

      <form onSubmit={applyFilters} className="mt-4 grid gap-3 border border-line p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-muted">
          Book title
          <input
            value={draft.book}
            onChange={(e) => setDraft((d) => ({ ...d, book: e.target.value }))}
            className="mt-1 w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="block text-xs text-muted">
          Author name or email
          <input
            value={draft.author}
            onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))}
            className="mt-1 w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="block text-xs text-muted">
          From
          <input
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="mt-1 w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="block text-xs text-muted">
          To
          <input
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="mt-1 w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <div className="flex gap-3 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="bg-accent px-4 py-1.5 text-sm text-paper">
            Search
          </button>
          {filtered && (
            <button type="button" className="text-sm text-muted hover:underline" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          {loading ? "Loading…" : total ? `Showing ${first}–${last} of ${total}` : "Nothing here."}
        </p>
        <label className="flex items-center gap-2 text-xs text-muted">
          Per page
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]);
              setPage(1);
            }}
            className="border border-line bg-paper px-2 py-1 text-sm text-ink"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="mt-3 space-y-3">
        {items.map((it) => (
          <li key={it.id} className="border border-line px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs text-muted">
                <span className="text-ink">{it.bookTitle}</span> by {it.authorName}
                {it.bookListed ? " · listed" : ""} ·{" "}
                {it.writtenBy === "author"
                  ? "Author reply"
                  : `${it.readerName || it.readerEmail || "Reader"}${
                      it.readerName && it.readerEmail ? ` <${it.readerEmail}>` : ""
                    }${it.isReply ? " · reply" : ""}`}{" "}
                · {new Date(it.createdAt).toLocaleString()}
              </p>
              <button
                type="button"
                className="text-xs text-danger hover:underline"
                onClick={() => void remove(it)}
              >
                Delete
              </button>
            </div>
            {it.excerpt && (
              <p className="mt-2 border-l-2 border-line pl-2 text-xs italic text-muted">“{it.excerpt}”</p>
            )}
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{it.body}</p>
          </li>
        ))}
      </ul>

      {pageCount > 1 && (
        <nav className="mt-4 flex flex-wrap items-center gap-3 text-sm" aria-label="Pages">
          <button
            type="button"
            disabled={page <= 1 || loading}
            className="border border-line px-3 py-1 disabled:opacity-40"
            onClick={() => setPage((p) => p - 1)}
          >
            ← Previous
          </button>
          <label className="flex items-center gap-2 text-muted">
            Page
            <select
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
              className="border border-line bg-paper px-2 py-1 text-ink"
            >
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            of {pageCount}
          </label>
          <button
            type="button"
            disabled={page >= pageCount || loading}
            className="border border-line px-3 py-1 disabled:opacity-40"
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </nav>
      )}
    </section>
  );
}

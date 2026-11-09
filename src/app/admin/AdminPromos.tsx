"use client";

import { useCallback, useEffect, useState } from "react";

type Promo = {
  id: string;
  title: string;
  genre: string;
  description: string;
  startsOn: string;
  endsOn: string;
  status: "open" | "cancelled" | "hidden";
  path: string;
  hostName: string;
  hostEmail: string | null;
  books: number;
  createdAt: string;
};

/** Group promo pages authors host; hide one if it breaks the rules, and the host is told. */
export function AdminPromos({ onNote }: { onNote: (msg: string | null) => void }) {
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/promos");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onNote(data.error || "Could not load promos");
      setPromos([]);
      return;
    }
    setPromos(data.promos || []);
  }, [onNote]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setHidden(p: Promo, hidden: boolean) {
    if (hidden && !window.confirm(`Hide "${p.title}"? Readers won't see it and the host will be told.`)) return;
    setBusy(p.id);
    try {
      const res = await fetch("/api/admin/promos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, hidden }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) onNote(data.error || "Could not update");
      else onNote(hidden ? `Hid "${p.title}".` : `"${p.title}" is visible again.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!promos) return <p className="mt-6 text-sm text-muted">Loading…</p>;

  return (
    <div className="mt-6">
      <p className="text-sm text-muted">
        Group promo pages that authors host at /promos. Hiding one takes it off the public site and stops new books joining;
        the host gets a notice. Cancelled promos were closed by their host.
      </p>
      {promos.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No group promos yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {promos.map((p) => (
            <li key={p.id} className={`border p-4 text-sm ${p.status === "hidden" ? "border-danger/50" : "border-line"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a href={p.path} target="_blank" rel="noopener noreferrer" className="font-display text-lg hover:text-accent">
                  {p.title}
                </a>
                <span className={`text-xs uppercase tracking-wide ${p.status === "hidden" ? "text-danger" : p.status === "cancelled" ? "text-muted" : "text-accent"}`}>
                  {p.status === "open" ? "Live" : p.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {p.startsOn} to {p.endsOn}
                {p.genre ? ` · ${p.genre}` : ""} · {p.books} books · hosted by {p.hostName}
                {p.hostEmail ? ` (${p.hostEmail})` : ""}
              </p>
              {p.description && <p className="mt-2 whitespace-pre-wrap text-muted">{p.description}</p>}
              {p.status !== "cancelled" && (
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => void setHidden(p, p.status !== "hidden")}
                  className={`mt-3 px-3 py-1.5 text-xs disabled:opacity-50 ${p.status === "hidden" ? "border border-line text-ink" : "bg-danger text-paper"}`}
                >
                  {p.status === "hidden" ? "Show it again" : "Hide this promo"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

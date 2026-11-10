"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SHELVES = [
  { id: "want", label: "Want to read" },
  { id: "reading", label: "Reading" },
  { id: "finished", label: "Finished" },
  { id: "dnf", label: "Did not finish" },
];

/** Put a book on your shelves from its page, and follow its series. Signed-out visitors get a sign-up link. */
export function LibraryButton({ projectId, className = "" }: { projectId: string; className?: string }) {
  const [state, setState] = useState<{ signedIn: boolean; shelf: string | null; series: { name: string; followed: boolean } | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/library?projectId=${projectId}`)
      .then(async (r) => {
        if (r.status === 401) return setState({ signedIn: false, shelf: null, series: null });
        const d = await r.json().catch(() => ({}));
        if (d.migrationNeeded) return setState(null);
        setState({ signedIn: true, shelf: d.shelf || null, series: d.series || null });
      })
      .catch(() => setState(null));
  }, [projectId]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, ...body }) });
      return res.ok;
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  if (!state.signedIn) {
    return (
      <Link href={`/beta/signup?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/books")}`} className={`font-ui inline-block border border-line px-3 py-1.5 text-sm text-accent ${className}`}>
        + Want to read
      </Link>
    );
  }
  return (
    <div className={`font-ui flex flex-wrap items-center gap-2 text-sm ${className}`}>
      <select
        aria-label="Your shelf"
        disabled={busy}
        value={state.shelf || ""}
        onChange={async (e) => {
          const shelf = e.target.value;
          if (shelf && (await post({ action: "add", shelf }))) setState((s) => (s ? { ...s, shelf } : s));
        }}
        className={`border px-2 py-1.5 ${state.shelf ? "border-accent text-ink" : "border-line text-accent"}`}
      >
        <option value="" disabled>
          + Add to my library
        </option>
        {SHELVES.map((s) => (
          <option key={s.id} value={s.id}>
            {state.shelf === s.id ? "✓ " : ""}
            {s.label}
          </option>
        ))}
      </select>
      {state.series && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const followed = !state.series!.followed;
            if (await post({ action: followed ? "follow" : "unfollow" })) setState((s) => (s && s.series ? { ...s, series: { ...s.series, followed } } : s));
          }}
          className="border border-line px-2 py-1.5 text-xs"
          title="Get a notice when the next book in this series comes out"
        >
          {state.series.followed ? `✓ Following ${state.series.name}` : `Tell me when the next ${state.series.name} book is out`}
        </button>
      )}
      {state.shelf && (
        <Link href="/library" className="text-xs text-accent underline">
          My library
        </Link>
      )}
    </div>
  );
}

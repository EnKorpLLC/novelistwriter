"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SHELVES = [
  { id: "want", label: "To be read (TBR)" },
  { id: "reading", label: "Reading" },
  { id: "finished", label: "Finished" },
  { id: "dnf", label: "Did not finish" },
];
const SHORT: Record<string, string> = { want: "On your TBR", reading: "Reading", finished: "Finished", dnf: "Did not finish" };

async function saveShelf(projectId: string, body: Record<string, unknown>) {
  const res = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, ...body }) }).catch(() => null);
  return Boolean(res?.ok);
}

function signupHref() {
  return `/beta/signup?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/books")}`;
}

/**
 * Put a book on your TBR (or another shelf) from its page, and follow its series.
 * Saving a book doesn't buy it; the author only ever sees a count.
 */
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
      return await saveShelf(projectId, body);
    } finally {
      setBusy(false);
    }
  }
  async function setShelf(shelf: string) {
    if (await post({ action: "add", shelf })) setState((s) => (s ? { ...s, shelf } : s));
  }

  if (!state) return null;
  if (!state.signedIn) {
    return (
      <div className={`font-ui text-sm ${className}`}>
        <Link href={signupHref()} className="inline-block border border-accent px-3 py-1.5 text-accent">
          + Add to TBR
        </Link>
        <p className="mt-1 text-xs text-muted">Free reader account. Saving a book doesn&apos;t buy it.</p>
      </div>
    );
  }
  return (
    <div className={`font-ui flex flex-wrap items-center gap-2 text-sm ${className}`}>
      {!state.shelf ? (
        <button type="button" disabled={busy} onClick={() => void setShelf("want")} className="border border-accent px-3 py-1.5 text-accent" title="Saves it to your library. Nothing is bought.">
          + Add to TBR
        </button>
      ) : (
        <select aria-label="Your shelf" disabled={busy} value={state.shelf} onChange={(e) => void setShelf(e.target.value)} className="border border-accent px-2 py-1.5 text-ink">
          {SHELVES.map((s) => (
            <option key={s.id} value={s.id}>
              {state.shelf === s.id ? `✓ ${SHORT[s.id]}` : `Move to ${s.label}`}
            </option>
          ))}
        </select>
      )}
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

let shelvesOnce: Promise<Record<string, string> | null> | null = null;
/** One request per page for every TBR button in a catalog grid. Null when signed out. */
function myShelves() {
  shelvesOnce ??= fetch("/api/library?shelves=1")
    .then(async (r) => (r.status === 401 ? null : ((await r.json()).shelves as Record<string, string>) || {}))
    .catch(() => ({}));
  return shelvesOnce;
}

/** Small TBR toggle for book grids. */
export function TbrButton({ projectId }: { projectId: string }) {
  const [shelf, setShelf] = useState<string | null | undefined>(undefined);
  const [signedIn, setSignedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void myShelves().then((s) => {
      if (s === null) setSignedIn(false);
      setShelf(s?.[projectId] || null);
    });
  }, [projectId]);

  if (shelf === undefined) return null;
  if (!signedIn) {
    return (
      <Link href={signupHref()} className="font-ui text-xs text-accent hover:underline">
        + TBR
      </Link>
    );
  }
  if (shelf) {
    return (
      <Link href="/library" className="font-ui text-xs text-muted hover:text-ink">
        ✓ {SHORT[shelf] || "In your library"}
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      title="Saves it to your library. Nothing is bought."
      onClick={async () => {
        setBusy(true);
        if (await saveShelf(projectId, { action: "add", shelf: "want" })) setShelf("want");
        setBusy(false);
      }}
      className="font-ui text-xs text-accent hover:underline"
    >
      + TBR
    </button>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Follow a reader to see the books they love (when they share their shelves). */
export function FollowReaderButton({ handle }: { handle: string }) {
  const [state, setState] = useState<{ signedIn: boolean; following: boolean; self: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/reader/follows?handle=${encodeURIComponent(handle)}`)
      .then((r) => r.json())
      .then((d) => setState({ signedIn: Boolean(d.signedIn), following: Boolean(d.following), self: Boolean(d.self) }))
      .catch(() => setState(null));
  }, [handle]);

  if (!state || state.self) return null;
  if (!state.signedIn) {
    return (
      <Link href={`/login?next=/r/${handle}`} className="font-ui inline-block border border-line px-3 py-1.5 text-sm text-accent">
        Follow
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch("/api/reader/follows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, action: state.following ? "unfollow" : "follow" }),
        }).catch(() => null);
        if (res?.ok) setState({ ...state, following: !state.following });
        setBusy(false);
      }}
      className={`font-ui border px-3 py-1.5 text-sm ${state.following ? "border-accent text-ink" : "border-line text-accent"}`}
    >
      {state.following ? "✓ Following" : "Follow"}
    </button>
  );
}

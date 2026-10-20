"use client";

import { useEffect, useState } from "react";
import type { LabeledLink } from "@/lib/public-profile";

export function AuthorLinks({ links, className = "" }: { links: LabeledLink[]; className?: string }) {
  if (!links.length) return null;
  return (
    <ul className={`font-ui flex flex-wrap gap-x-4 gap-y-1 text-sm ${className}`}>
      {links.map((l) => (
        <li key={`${l.label}-${l.url}`}>
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Follow button + "join email list" checkbox for a logged-in reader on a book page. */
export function AuthorConnect({
  authorUserId,
  authorName,
  initialSubscribed,
  canSubscribe,
}: {
  authorUserId: string;
  authorName: string;
  initialSubscribed: boolean;
  canSubscribe: boolean;
}) {
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [subBusy, setSubBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/beta/follows")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        const ids = new Set(
          ((json.follows || []) as { authorUserId: string }[]).map((f) => f.authorUserId)
        );
        setFollowing(ids.has(authorUserId));
      });
  }, [authorUserId]);

  async function toggleFollow() {
    setFollowBusy(true);
    try {
      const res = await fetch("/api/beta/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorUserId, action: following ? "unfollow" : "follow" }),
      });
      const json = await res.json();
      if (res.ok) setFollowing(Boolean(json.following));
    } finally {
      setFollowBusy(false);
    }
  }

  async function toggleSubscribe(next: boolean) {
    setSubBusy(true);
    try {
      const res = await fetch("/api/audience/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorUserId, subscribe: next }),
      });
      const json = await res.json();
      if (res.ok) setSubscribed(Boolean(json.subscribed));
    } finally {
      setSubBusy(false);
    }
  }

  return (
    <div className="font-ui flex flex-wrap items-center gap-4 text-sm">
      <button
        type="button"
        disabled={followBusy}
        onClick={() => void toggleFollow()}
        className="border border-line px-3 py-1 text-xs text-accent disabled:opacity-60"
        title="Get notified when this author opens a new beta or ARC"
      >
        {followBusy ? "…" : following ? "Following" : "Follow author"}
      </button>
      {canSubscribe && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={subscribed}
            disabled={subBusy}
            onChange={(e) => void toggleSubscribe(e.target.checked)}
          />
          Join {authorName}&apos;s email list
        </label>
      )}
    </div>
  );
}

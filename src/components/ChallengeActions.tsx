"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ChallengeActions({
  slug,
  code,
  loggedIn,
  joined,
  ended,
  showOnLeaderboard,
  inviteUrl,
}: {
  slug: string;
  code: string | null;
  loggedIn: boolean;
  joined: boolean;
  ended: boolean;
  showOnLeaderboard: boolean;
  inviteUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/challenges/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...extra }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong");
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const next = encodeURIComponent(`/challenges/${slug}${code ? `?code=${code}` : ""}`);

  return (
    <div className="font-ui space-y-3 text-sm">
      {!joined && !ended && (
        loggedIn ? (
          <button type="button" disabled={busy} onClick={() => void act("join")} className="bg-accent px-5 py-2.5 text-paper disabled:opacity-50">
            {busy ? "Joining…" : "Join this challenge"}
          </button>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Link href={`/signup?next=${next}`} className="bg-accent px-5 py-2.5 text-paper">
              Sign up free to join
            </Link>
            <Link href={`/login?next=${next}`} className="border border-line px-5 py-2.5 text-ink">
              Log in
            </Link>
          </div>
        )
      )}

      {joined && (
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" disabled={busy} onClick={() => void act("refresh")} className="text-accent underline disabled:opacity-50">
            Update my numbers
          </button>
          <label className="flex items-center gap-2 text-muted">
            <input
              type="checkbox"
              checked={showOnLeaderboard}
              disabled={busy}
              onChange={(e) => void act("visibility", { showOnLeaderboard: e.target.checked })}
            />
            Show me on the leaderboard
          </label>
          {!ended && (
            <button
              type="button"
              disabled={busy}
              onClick={() => window.confirm("Leave this challenge? Your writing isn't affected.") && void act("leave")}
              className="text-muted underline disabled:opacity-50"
            >
              Leave
            </button>
          )}
        </div>
      )}

      {inviteUrl && (
        <div className="border border-line p-3">
          <p className="text-xs text-muted">Invite link: anyone with it can join this group challenge.</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="min-w-0 truncate text-xs text-ink">{inviteUrl}</code>
            <button
              type="button"
              className="text-xs text-accent underline"
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                });
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      {note && <p className="text-danger">{note}</p>}
    </div>
  );
}

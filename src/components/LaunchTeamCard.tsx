"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TEAM_TASKS, libraryNote } from "@/lib/launch-team";

/** L5: on the launch page, readers join the street team and tick off their launch tasks. */
export function LaunchTeamCard({
  projectId,
  title,
  authorName,
  loggedIn,
  path,
}: {
  projectId: string;
  title: string;
  authorName: string;
  loggedIn: boolean;
  path: string;
}) {
  const [state, setState] = useState<{ open: boolean; member: boolean; tasks: Record<string, string>; members: number; isAuthor?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetch(`/api/launch-team/${projectId}`)
      .then(async (r) => (r.ok ? setState(await r.json()) : null))
      .catch(() => null);
  }, [projectId]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/launch-team/${projectId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong");
      setState((s) => (s ? { ...s, member: json.member, tasks: json.tasks || {}, members: s.members + (body.action === "join" ? 1 : body.action === "leave" ? -1 : 0) } : s));
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!state || state.isAuthor || (!state.open && !state.member)) return null;

  return (
    <div className="font-ui border border-line p-4">
      <p className="font-display text-lg">{state.member ? "You're on the launch team" : `Help launch ${title}`}</p>
      {!state.member ? (
        <>
          <p className="mt-1 text-xs text-muted">
            Join {authorName}&apos;s launch team: share on launch day, post a review, and ask your library. You&apos;ll earn the
            Launch team badge, which authors see when you ask for advance copies.
            {state.members > 0 ? ` ${state.members} reader${state.members === 1 ? " has" : "s have"} joined.` : ""}
          </p>
          {loggedIn ? (
            <button type="button" disabled={busy} onClick={() => void act({ action: "join" })} className="mt-3 bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50">
              Join the launch team
            </button>
          ) : (
            <Link href={`/beta/signup?next=${encodeURIComponent(path)}`} className="mt-3 inline-block bg-ink px-4 py-2 text-sm text-paper">
              Sign up free to join
            </Link>
          )}
        </>
      ) : (
        <>
          <ul className="mt-3 space-y-2 text-sm">
            {TEAM_TASKS.map((t) => (
              <li key={t.id}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(state.tasks[t.id])}
                    disabled={busy}
                    onChange={(e) => void act({ action: "task", task: t.id, done: e.target.checked })}
                  />
                  <span>
                    {t.label}
                    <span className="block text-xs text-muted">{t.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 text-xs text-accent underline"
            onClick={() => {
              void navigator.clipboard.writeText(libraryNote(title, authorName)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
          >
            {copied ? "Copied the library note" : "Copy a note for your library"}
          </button>
          <button type="button" disabled={busy} onClick={() => void act({ action: "leave" })} className="ml-4 text-xs text-muted underline">
            Leave the team
          </button>
        </>
      )}
      {note && <p className="mt-2 text-xs text-danger">{note}</p>}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

export type PassNoticeData =
  | { kind: "expiring"; daysLeft: number; endsAt: string; bankDays: number; wouldLock: string[] }
  | { kind: "ended"; endedAt: string; bankDays: number; locked: string[]; graceUntil: string | null }
  | { kind: "banked"; bankDays: number };

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Studio pass warnings and upgrade choices for the author dashboard and projects. */
export function PassNotice({ notice, compact = false }: { notice: PassNoticeData; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(action: "start" | "dismissEnded") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      if (action === "start") window.location.reload();
      else setHidden(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  const startButton =
    notice.bankDays > 0 ? (
      <button
        type="button"
        disabled={busy}
        onClick={() => void post("start")}
        className="border border-line px-3 py-1.5 text-xs text-accent disabled:opacity-50"
      >
        Start {notice.bankDays} banked day{notice.bankDays === 1 ? "" : "s"}
      </button>
    ) : null;

  const choices = (
    <div className="mt-2 flex flex-wrap gap-2">
      <Link href="/billing" className="bg-accent px-3 py-1.5 text-xs text-paper">
        Get Studio
      </Link>
      <Link href="/billing" className="border border-line px-3 py-1.5 text-xs text-accent">
        Get Pro
      </Link>
      {startButton || (
        <Link href="/dashboard/share" className="border border-line px-3 py-1.5 text-xs text-accent">
          Earn more days
        </Link>
      )}
    </div>
  );

  if (notice.kind === "banked") {
    return (
      <div className="font-ui border border-line bg-paper-deep/40 px-4 py-3 text-sm">
        <p className="text-ink">
          You have {notice.bankDays} free Studio day{notice.bankDays === 1 ? "" : "s"} saved. Start
          them whenever you want to run a beta or ARC. They run back to back once started.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {startButton}
          <Link href="/dashboard/share" className="self-center text-xs text-accent underline">
            How to earn more
          </Link>
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  if (notice.kind === "expiring") {
    return (
      <div className={`font-ui border border-warn/60 bg-paper-deep/60 px-4 ${compact ? "py-2" : "py-3"} text-sm`}>
        <p className="text-ink">
          <strong>
            Your free Studio pass ends in {notice.daysLeft} day{notice.daysLeft === 1 ? "" : "s"}
          </strong>{" "}
          ({when(notice.endsAt)}).
          {!compact && (
            <>
              {" "}
              After that, beta and ARC listings and new invites pause right away, and current readers
              get 7 days to finish.
              {notice.wouldLock.length > 0 &&
                ` On the Free plan these would lock to export-only: ${notice.wouldLock.join(", ")}.`}
            </>
          )}
        </p>
        {choices}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="font-ui border border-line bg-paper-deep/60 px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-ink">
          <strong>Your Studio pass ended</strong> on {when(notice.endedAt)}. Beta and ARC listings
          are paused.
          {notice.graceUntil && ` Current readers can keep reading until ${when(notice.graceUntil)}.`}
          {notice.locked.length > 0 && ` Locked to export-only: ${notice.locked.join(", ")}.`}
        </p>
        <button
          type="button"
          className="shrink-0 text-xs text-muted hover:underline"
          disabled={busy}
          onClick={() => void post("dismissEnded")}
        >
          Dismiss
        </button>
      </div>
      {choices}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

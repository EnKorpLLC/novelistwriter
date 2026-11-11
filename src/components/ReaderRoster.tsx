"use client";

import { useState } from "react";
import type { TeamState } from "@/lib/reader-roster";

export type RosterStats = {
  finished: boolean;
  dnf?: boolean;
  percent: number;
  /** Beta readers only; advance readers highlight in private */
  comments?: number | null;
  review: boolean;
  team?: TeamState;
};

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Finished or how far, comments, review, and launch team, on one line. */
export function ReaderStatsLine({ stats }: { stats: RosterStats }) {
  const parts = [
    stats.finished ? "Finished" : stats.dnf ? `Stopped (DNF) at ${stats.percent}%` : stats.percent > 0 ? `Read ${stats.percent}%` : "Not started",
    stats.comments != null ? `${stats.comments} comment${stats.comments === 1 ? "" : "s"}` : null,
    stats.review ? "Review left" : "No review yet",
    stats.team?.member ? "On the launch team" : stats.team?.invitedAt ? `Invited to the launch team ${day(stats.team.invitedAt)}` : null,
  ].filter(Boolean);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {!stats.finished && !stats.dnf && (
        <span className="inline-block h-1.5 w-16 bg-line/70" aria-hidden="true">
          <span className="block h-full bg-accent" style={{ width: `${stats.percent}%` }} />
        </span>
      )}
      {parts.map((p, i) => (
        <span key={p} className={i === 0 && stats.finished ? "text-accent" : undefined}>
          {i > 0 ? "· " : ""}
          {p}
        </span>
      ))}
    </span>
  );
}

/** Invite to the ARC (beta readers), invite to the launch team, and delete from this book's lists. */
export function ReaderActions({
  projectId,
  kind,
  email,
  displayName,
  team,
  onDone,
  onNote,
}: {
  projectId: string;
  kind: "beta" | "arc";
  email: string;
  displayName?: string | null;
  team?: TeamState;
  onDone: () => void;
  onNote: (msg: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const who = displayName ? `${displayName} (${email})` : email;

  async function call(name: string, url: string, body: Record<string, unknown>, ok: string) {
    setBusy(name);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNote(data.error || "Something went wrong");
        return;
      }
      onNote(ok);
      onDone();
    } finally {
      setBusy(null);
    }
  }

  const btn = "border border-line px-2 py-1 text-[10px] disabled:opacity-50";
  return (
    <span className="flex flex-wrap items-center gap-2">
      {kind === "beta" && (
        <button
          type="button"
          disabled={!!busy}
          className={`${btn} text-accent`}
          onClick={() =>
            void call("arc", `/api/projects/${projectId}/arc`, { action: "invite", email, displayName: displayName || undefined }, `${who} has the advance copy now, and we emailed them.`)
          }
        >
          {busy === "arc" ? "Inviting…" : "Invite to ARC"}
        </button>
      )}
      {!team?.member && (
        <button
          type="button"
          disabled={!!busy}
          className={`${btn} text-accent`}
          onClick={() => void call("team", "/api/audience/readers", { action: "invite_team", projectId, email, displayName }, `Launch team invite sent to ${who}.`)}
        >
          {busy === "team" ? "Inviting…" : team?.invitedAt ? "Invite to launch team again" : "Invite to launch team"}
        </button>
      )}
      <button
        type="button"
        disabled={!!busy}
        className={`${btn} text-danger`}
        onClick={() => {
          if (window.confirm(`Delete ${who} from this book's ${kind === "beta" ? "beta" : "ARC"} readers? They lose access to the book. Their comments and reviews stay.`)) {
            void call("delete", "/api/audience/readers", { action: "remove", kind, projectId, email }, `${who} deleted.`);
          }
        }}
      >
        {busy === "delete" ? "Deleting…" : "Delete"}
      </button>
    </span>
  );
}

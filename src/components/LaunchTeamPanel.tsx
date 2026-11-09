"use client";

import { useEffect, useState } from "react";
import { TEAM_TASKS } from "@/lib/launch-team";

type Member = { name: string; joinedAt: string; tasks: string[] };

/** L5: the author's launch team in the Launch tab, with a thank-you to everyone at once. */
export function LaunchTeamPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<{ members: Member[]; lastThankedAt: string | null } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/launch-team`)
      .then(async (r) => (r.ok ? setData(await r.json()) : null))
      .catch(() => null);
  }, [projectId]);

  async function thank() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/launch-team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not send");
      setNote(`Thanked ${json.thanked} reader${json.thanked === 1 ? "" : "s"}.`);
      setData((d) => (d ? { ...d, lastThankedAt: new Date().toISOString() } : d));
      setMessage("");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  const label = (id: string) => TEAM_TASKS.find((t) => t.id === id)?.label.split(" ").slice(0, 2).join(" ") || id;

  return (
    <section className="border border-line p-4">
      <h3 className="font-display text-lg">Launch team ({data.members.length})</h3>
      <p className="mt-1 text-xs text-muted">
        Readers join from your launch page to share on launch day, post reviews, and ask their libraries. They earn the Launch
        team badge, which you&apos;ll see on their future ARC requests.
      </p>
      {data.members.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No one yet. The invitation shows on your launch page until two weeks after release.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-line border border-line text-sm">
            {data.members.map((m, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span className="text-ink">{m.name}</span>
                <span className="text-xs text-muted">{m.tasks.length ? m.tasks.map(label).join(" · ") : "No tasks yet"}</span>
              </li>
            ))}
          </ul>
          <textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Thank you for helping launch this book. It means more than I can say."
            className="mt-3 w-full border border-line bg-paper px-3 py-2 text-sm"
          />
          <button type="button" disabled={busy} onClick={() => void thank()} className="mt-2 border border-accent px-3 py-1.5 text-sm text-accent disabled:opacity-50">
            {busy ? "Sending…" : "Thank the team"}
          </button>
          {data.lastThankedAt && <span className="ml-3 text-xs text-muted">Last thanked {new Date(data.lastThankedAt).toLocaleDateString()}</span>}
        </>
      )}
      {note && <p className="mt-2 text-xs text-ink">{note}</p>}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";

type Day = { day: string; views: number; clicks: number; signups: number; reviews: number; shares: number };
type Data = {
  studio: boolean;
  anchor?: string;
  today?: string;
  series?: Day[];
  totals?: { views: number; clicks: number; signups: number; reviews: number; shares: number; reviewsAllTime: number; team: number; teamTasks: number };
  stores?: { store: string; clicks: number }[];
};

const MILESTONES: { key: "views" | "clicks" | "signups" | "reviewsAllTime"; at: number[]; label: (n: number) => string }[] = [
  { key: "clicks", at: [1, 10, 50, 100, 500], label: (n) => (n === 1 ? "First buy click" : `${n} buy clicks`) },
  { key: "views", at: [25, 100, 500, 1000], label: (n) => `${n} people visited your launch page` },
  { key: "reviewsAllTime", at: [1, 5, 10, 25, 50], label: (n) => (n === 1 ? "First review posted" : `${n} reviews posted`) },
  { key: "signups", at: [10, 25, 100], label: (n) => `${n} new readers on your list` },
];

/** L4: the launch-week dashboard, shown from a week before release to two weeks after (Studio). */
export function LaunchRoom({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    const load = () =>
      fetch(`/api/projects/${projectId}/launch-room`)
        .then(async (r) => (r.ok ? setData(await r.json()) : null))
        .catch(() => null);
    void load();
    // Launch day is live: refresh every two minutes while the tab is open
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [projectId]);

  if (!data?.studio || !data.series || !data.totals || !data.anchor || !data.today) return null;
  const daysToRelease = Math.round((Date.parse(`${data.anchor}T12:00:00Z`) - Date.parse(`${data.today}T12:00:00Z`)) / 86400000);
  if (daysToRelease > 7 || daysToRelease < -30) return null;

  const t = data.totals;
  const max = Math.max(1, ...data.series.map((d) => d.views + d.clicks));
  const reached = MILESTONES.flatMap((m) => {
    const best = [...m.at].reverse().find((n) => t[m.key] >= n);
    return best ? [m.label(best)] : [];
  });

  return (
    <section className="border border-accent/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">Launch week</h3>
        <span className="text-xs text-muted">Updates every two minutes</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
        {(
          [
            ["Visitors", t.views],
            ["Buy clicks", t.clicks],
            ["New on your list", t.signups],
            ["Reviews posted", t.reviewsAllTime],
            ["Share visits", t.shares],
            ["Launch team tasks", t.teamTasks],
          ] as const
        ).map(([label, n]) => (
          <div key={label}>
            <dt className="text-[11px] text-muted">{label}</dt>
            <dd className="text-xl text-ink">{n.toLocaleString()}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex h-28 items-end gap-0.5" aria-label="Visitors and buy clicks per day">
        {data.series.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col justify-end" title={`${d.day}: ${d.views} visitors, ${d.clicks} buy clicks, ${d.reviews} reviews`}>
            <div className="bg-accent" style={{ height: `${(d.clicks / max) * 100}%` }} />
            <div className={d.day === data.anchor ? "bg-ink/60" : "bg-line"} style={{ height: `${(d.views / max) * 100}%`, minHeight: 2 }} />
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Gray: visitors. Green: buy clicks. The darker bar is release day. A week before to two weeks after.
      </p>

      {data.stores && data.stores.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3 text-xs">
          {data.stores.map((s) => (
            <li key={s.store} className="border border-line px-2 py-1">
              {s.store}: <span className="text-ink">{s.clicks}</span>
            </li>
          ))}
        </ul>
      )}

      {reached.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {reached.map((r) => (
            <li key={r} className="text-accent">
              ✓ {r}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted">
        Buy clicks count taps on your launch page&apos;s buttons. Stores don&apos;t share sales with us, so check your store
        dashboards for sales.
      </p>
    </section>
  );
}

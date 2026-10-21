"use client";

import { useEffect, useState } from "react";

type Metrics = {
  days: number;
  since: string;
  traffic: {
    pageviews: number;
    visitors: number;
    signups: number;
    conversion: number;
    externalArrivals: number;
    capped: boolean;
    daily: { day: string; visitors: number; pageviews: number; signups: number }[];
    topPages: { path: string; views: number; visitors: number }[];
    topReferrers: { host: string; arrivals: number }[];
    campaigns: { name: string; arrivals: number; signups: number; conversion: number }[];
    signupSources: { source: string; signups: number }[];
  };
  authors: Record<string, number> & {
    plans: { free: number; pro: number; studio: number; passRunning: number };
  };
  readers: Record<string, number>;
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (n: number) => n.toLocaleString();

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border border-line px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-2xl text-ink">{typeof value === "number" ? num(value) : value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <table className="mt-2 w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
          {head.map((h, i) => (
            <th key={h} className={`py-1.5 ${i ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line/60">
            {r.map((c, j) => (
              <td key={j} className={`py-1.5 ${j ? "text-right tabular-nums" : "break-all pr-3 text-ink"}`}>
                {typeof c === "number" ? num(c) : c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AdminMetrics({ onNote }: { onNote: (msg: string | null) => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    void fetch(`/api/admin/metrics?days=${days}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Could not load metrics");
        setData(json);
      })
      .catch((err) => onNote(err instanceof Error ? err.message : "Could not load metrics"))
      .finally(() => setLoading(false));
  }, [days, onNote]);

  const t = data?.traffic;
  const maxDaily = Math.max(1, ...(t?.daily || []).map((d) => d.visitors));

  return (
    <section className="mt-6 space-y-10">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">Range:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            className={days === d ? "text-ink underline" : "text-muted hover:text-ink"}
            onClick={() => setDays(d)}
          >
            Last {d} days
          </button>
        ))}
        {loading && <span className="text-xs text-muted">Loading…</span>}
      </div>

      {data && t && (
        <>
          <div>
            <h2 className="font-display text-xl">Traffic and advertising</h2>
            <p className="mt-1 text-xs text-muted">
              Counted on our own servers, no cookies. A visitor is one person on one day, so the same
              person on two days counts twice. Tag ad links with ?utm_source=, &amp;utm_medium=, and
              &amp;utm_campaign= to see them under Campaigns.
              {t.capped && " This range hit the 50,000-view reading limit; totals are a floor."}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Visitors" value={t.visitors} />
              <Stat label="Page views" value={t.pageviews} />
              <Stat label="Arrivals from links/ads" value={t.externalArrivals} />
              <Stat label="Signups" value={t.signups} />
              <Stat label="Visitor → signup" value={pct(t.conversion)} />
            </div>
            {t.daily.length > 0 && (
              <div className="mt-4">
                <div className="flex h-28 items-end gap-0.5 border-b border-line">
                  {t.daily.map((d) => (
                    <div
                      key={d.day}
                      className="relative min-w-[4px] flex-1 bg-accent/80"
                      style={{ height: `${Math.max(2, (d.visitors / maxDaily) * 100)}%` }}
                      title={`${d.day}: ${d.visitors} visitors, ${d.pageviews} page views, ${d.signups} signups`}
                    >
                      {d.signups > 0 && <span className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-warn" />}
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Visitors per day since {data.since}. Dots mark days with signups. Hover a bar for details.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="font-display text-lg">Campaigns</h3>
              <Table
                head={["Source / medium / campaign", "Arrivals", "Signups", "Rate"]}
                rows={t.campaigns.map((c) => [c.name, c.arrivals, c.signups, pct(c.conversion)])}
                empty="No tagged links yet."
              />
            </div>
            <div>
              <h3 className="font-display text-lg">Where signups came from</h3>
              <Table
                head={["First source", "Signups"]}
                rows={t.signupSources.map((s) => [s.source, s.signups])}
                empty="No signups in this range."
              />
            </div>
            <div>
              <h3 className="font-display text-lg">Referring sites</h3>
              <Table
                head={["Site", "Arrivals"]}
                rows={t.topReferrers.map((r) => [r.host, r.arrivals])}
                empty="No outside referrers yet."
              />
            </div>
            <div>
              <h3 className="font-display text-lg">Top pages</h3>
              <Table
                head={["Page", "Views", "Visitors"]}
                rows={t.topPages.map((p) => [p.path, p.views, p.visitors])}
                empty="No page views yet."
              />
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl">Authors</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Author accounts" value={data.authors.total} hint={`${num(data.authors.new)} new`} />
              <Stat label="Active writers" value={data.authors.activeWriters} hint="wrote in the editor" />
              <Stat label="Words written" value={data.authors.wordsWritten} />
              <Stat label="Projects" value={data.authors.projectsTotal} hint={`${num(data.authors.projectsNew)} new`} />
              <Stat
                label="Plans"
                value={`${num(data.authors.plans.pro)} Pro · ${num(data.authors.plans.studio)} Studio`}
                hint={`${num(data.authors.plans.free)} free · ${num(data.authors.plans.passRunning)} on a Studio pass`}
              />
              <Stat label="AI runs" value={data.authors.aiJobs} hint={`${num(data.authors.aiOff)} accounts have AI off`} />
              <Stat label="Beta open / ARC open" value={`${num(data.authors.betaOpen)} / ${num(data.authors.arcOpen)}`} />
              <Stat label="Published / coming soon" value={`${num(data.authors.published)} / ${num(data.authors.launchPublic)}`} />
              <Stat label="Share-link visits" value={data.authors.shareVisits} />
              <Stat label="Studio days earned" value={data.authors.passDaysEarned} hint={`${num(data.authors.passDaysGifted)} gifted`} />
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl">Readers</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Reader accounts" value={data.readers.total} hint={`${num(data.readers.new)} new reader-only`} />
              <Stat label="Active readers" value={data.readers.activeReaders} hint={`${num(data.readers.readingDays)} reading days`} />
              <Stat label="Beta readers reading" value={data.readers.betaActive} hint={`${num(data.readers.betaRequests)} new applications`} />
              <Stat label="Beta finished / DNF" value={`${num(data.readers.betaFinished)} / ${num(data.readers.betaDnf)}`} />
              <Stat label="ARC readers active" value={data.readers.arcActive} hint={`${num(data.readers.arcRequests)} new requests`} />
              <Stat label="ARCs finished" value={data.readers.arcFinished} />
              <Stat label="Reviews / comments" value={`${num(data.readers.reviews)} / ${num(data.readers.comments)}`} />
              <Stat label="Follows" value={data.readers.follows} />
              <Stat label="List subscribers" value={data.readers.subscribers} hint={`${num(data.readers.subscribersNew)} joined`} />
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Totals are all-time; &ldquo;new,&rdquo; &ldquo;active,&rdquo; finished, and requests
              are for the selected range.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

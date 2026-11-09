"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NETWORK_LABEL, trackedUrl } from "@/lib/traffic-source";

type Row = { source: string; visitors: number; clicks: number; signups: number };
type Results = {
  pro: boolean;
  studio: boolean;
  noSite?: boolean;
  days: number;
  step: number;
  totals: { visitors: number; pageViews: number; clicks: number; signups: number; unsubscribes: number; listSize: number };
  series: { start: string; visitors: number; clicks: number; signups: number }[];
  sources: Row[];
  books: { id: string; title: string; visitors: number; clicks: number; stores: { store: string; clicks: number }[] }[];
  posts: { id: string; postOn: string; network: string; label: string; visitors: number; clicks: number }[];
  links: { label: string; url: string }[];
  capped: boolean;
};

const LINK_SOURCES = ["instagram", "tiktok", "facebook", "x", "threads", "bluesky", "linkedin", "pinterest", "newsletter", "bookbub", "ads"];

function fmtDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function MarketingResultsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkPage, setLinkPage] = useState(0);
  const [linkSource, setLinkSource] = useState("instagram");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setData(null);
    void fetch(`/api/marketing/results?days=${days}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Could not load results");
        setData(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load results"));
  }, [days]);

  const max = Math.max(1, ...(data?.series || []).map((s) => s.visitors));
  const link = data?.links?.[linkPage] ? trackedUrl(data.links[linkPage].url, linkSource) : null;

  return (
    <div className="font-ui mx-auto min-h-screen max-w-6xl px-6 py-10">
      <Link href="/dashboard/marketing" className="text-sm text-accent hover:underline">
        ← Marketing
      </Link>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl">Results</h1>
        <div className="flex gap-2 text-xs">
          {[30, 90, 365].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`border px-3 py-1.5 ${days === d ? "border-accent bg-accent/5 text-ink" : "border-line text-muted hover:text-ink"}`}
            >
              {d === 365 ? "Year" : `${d} days`}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Who visited your author site and book pages, where they came from, what they clicked, and which posts brought them.
      </p>

      {error && <p className="mt-6 text-sm text-danger">{error}</p>}
      {!data && !error && <p className="mt-6 text-sm text-muted">Loading…</p>}
      {data && !data.pro && (
        <div className="mt-6 border border-accent/40 bg-accent/5 p-4 text-sm">
          Results are part of Pro and Studio: visitors, where they came from, buy clicks, and your best posts.{" "}
          <a href="/billing" className="text-accent underline">
            Get Pro
          </a>
        </div>
      )}
      {data?.pro && data.noSite && (
        <p className="mt-6 text-sm text-muted">
          Pick an author handle in{" "}
          <Link href="/dashboard/profile" className="text-accent underline">
            your profile
          </Link>{" "}
          to get your author site, then results start counting.
        </p>
      )}

      {data?.pro && !data.noSite && data.totals && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: "Visitors", value: data.totals.visitors, hint: `${data.totals.pageViews.toLocaleString()} page views` },
              { label: "Buy clicks", value: data.totals.clicks, hint: "To the stores, from your pages" },
              ...(data.studio
                ? [
                    { label: "New on your list", value: data.totals.signups, hint: `${data.totals.unsubscribes} left` },
                    { label: "List size", value: data.totals.listSize, hint: "Confirmed and subscribed" },
                  ]
                : []),
              {
                label: "Click rate",
                value: data.totals.visitors ? `${Math.round((data.totals.clicks / data.totals.visitors) * 100)}%` : "–",
                hint: "Buy clicks per visitor",
              },
            ].map((t) => (
              <div key={t.label} className="border border-line p-4">
                <div className="text-xs text-muted">{t.label}</div>
                <div className="font-display mt-1 text-3xl">{typeof t.value === "number" ? t.value.toLocaleString() : t.value}</div>
                <div className="mt-1 text-[11px] text-muted">{t.hint}</div>
              </div>
            ))}
          </section>
          {!data.studio && (
            <p className="mt-2 text-xs text-muted">
              Studio adds your email list: new signups, where they came from, and list size.{" "}
              <a href="/billing" className="text-accent underline">
                Get Studio
              </a>
            </p>
          )}

          <section className="mt-8 border border-line p-4">
            <div className="flex items-baseline justify-between text-xs text-muted">
              <span>Visitors {data.step === 7 ? "by week" : "by day"}</span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 bg-accent/40" /> visitors <span className="ml-3 mr-1 inline-block h-2 w-2 bg-accent" /> buy clicks
              </span>
            </div>
            <div className="mt-3 flex h-40 items-end gap-[2px]">
              {data.series.map((s) => (
                <div
                  key={s.start}
                  className="relative flex-1 bg-accent/40"
                  style={{ height: `${(s.visitors / max) * 100}%`, minHeight: s.visitors ? 2 : 0 }}
                  title={`${fmtDay(s.start)}: ${s.visitors} visitors, ${s.clicks} buy clicks${data.studio ? `, ${s.signups} signups` : ""}`}
                >
                  <div className="absolute bottom-0 left-0 right-0 bg-accent" style={{ height: s.visitors ? `${Math.min(100, (s.clicks / s.visitors) * 100)}%` : 0 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{fmtDay(data.series[0]?.start || "")}</span>
              <span>Today</span>
            </div>
          </section>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="font-display text-xl">Where readers came from</h2>
              {data.sources.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No visits yet in this period.</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="py-1.5 font-normal">Source</th>
                      <th className="py-1.5 text-right font-normal">Visitors</th>
                      <th className="py-1.5 text-right font-normal">Buy clicks</th>
                      {data.studio && <th className="py-1.5 text-right font-normal">Signups</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.slice(0, 15).map((s) => (
                      <tr key={s.source} className="border-b border-line/60">
                        <td className="py-1.5">{s.source}</td>
                        <td className="py-1.5 text-right">{s.visitors.toLocaleString()}</td>
                        <td className="py-1.5 text-right">{s.clicks.toLocaleString()}</td>
                        {data.studio && <td className="py-1.5 text-right">{s.signups.toLocaleString()}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-xs text-muted">
                “Novelist Writer” means readers found you through the catalog, a challenge, or another page here. Apps like
                Instagram and TikTok often hide where a visit came from, so use tracked links to see them.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl">Your best posts</h2>
              {data.posts.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  Share posts from your{" "}
                  <Link href="/dashboard/marketing#calendar" className="text-accent underline">
                    calendar
                  </Link>{" "}
                  with their tracked links (“Copy text and link”), and the ones that bring readers show up here.
                </p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {data.posts.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-2">
                      <span>
                        <span className="text-muted">
                          {fmtDay(p.postOn)} · {NETWORK_LABEL[p.network] || p.network} ·{" "}
                        </span>
                        {p.label}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {p.visitors} visitors · {p.clicks} clicks
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="font-display mt-8 text-xl">By book</h2>
              {data.books.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No book page visits yet in this period.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {data.books.map((b) => (
                    <li key={b.id} className="border-b border-line/60 pb-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span>{b.title}</span>
                        <span className="text-xs text-muted">
                          {b.visitors} visitors · {b.clicks} buy clicks
                        </span>
                      </div>
                      {b.stores.length > 0 && <div className="mt-0.5 text-xs text-muted">{b.stores.map((s) => `${s.store} ${s.clicks}`).join(" · ")}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="mt-10 border border-line p-4">
            <h2 className="font-display text-xl">Make a tracked link</h2>
            <p className="mt-1 text-sm text-muted">
              Use it in your bio, an ad, a newsletter, or a deal site listing. Visits through it show up above under its source.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
              <label className="text-xs text-muted">
                Page
                <select value={linkPage} onChange={(e) => setLinkPage(Number(e.target.value))} className="mt-1 block border border-line bg-paper px-2 py-1.5 text-sm text-ink">
                  {data.links.map((l, i) => (
                    <option key={l.url} value={i}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Where you&apos;ll share it
                <select value={linkSource} onChange={(e) => setLinkSource(e.target.value)} className="mt-1 block border border-line bg-paper px-2 py-1.5 text-sm text-ink">
                  {LINK_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {NETWORK_LABEL[s] || s}
                    </option>
                  ))}
                </select>
              </label>
              {link && (
                <button
                  type="button"
                  className="bg-accent px-4 py-2 text-sm text-paper"
                  onClick={() => {
                    void navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              )}
            </div>
            {link && <p className="mt-2 break-all text-xs text-muted">{link}</p>}
          </section>

          <p className="mt-6 text-xs text-muted">
            Counted on Novelist Writer itself, with no cookies and nothing sent to other companies. A visitor counts once a day.
            Ad blockers hide some visits, and buy clicks count clicks to the store, not sales.
            {data.capped ? " This period has more visits than we can add up at once, so totals are a floor." : ""}
          </p>
        </>
      )}
    </div>
  );
}

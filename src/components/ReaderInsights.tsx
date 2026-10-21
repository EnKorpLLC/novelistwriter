"use client";

import { useCallback, useEffect, useState } from "react";
import type { InsightsPhase, ReaderInsights as Insights, ReaderStatus } from "@/lib/reader-insights";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const READER_PREVIEW = 25;
const OPEN_KEY = "nw_reader_insights_open";

const STATUS_LABEL: Record<ReaderStatus, string> = {
  finished: "Finished",
  dnf: "Did not finish",
  reading: "Reading",
  stalled: "Stalled",
  not_started: "Not started",
};

const STATUS_CLASS: Record<ReaderStatus, string> = {
  finished: "text-accent",
  dnf: "text-danger",
  reading: "text-ink",
  stalled: "text-danger",
  not_started: "text-muted",
};

function shortDay(day: string) {
  return new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function shortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border border-line px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-2xl text-ink">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Bars({
  data,
  highlight,
}: {
  data: { label: string; value: number; title: string }[];
  highlight?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex h-28 items-end gap-0.5 border-b border-line">
        {data.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            className={`min-w-[4px] flex-1 ${i === highlight ? "bg-accent" : "bg-accent/60"}`}
            style={{ height: d.value ? `${Math.max(4, (d.value / max) * 100)}%` : "2px" }}
            title={d.title}
          />
        ))}
      </div>
      {data.length > 0 && (
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>{data[0].label}</span>
          {data.length > 2 && <span>{data[Math.floor(data.length / 2)].label}</span>}
          <span>{data[data.length - 1].label}</span>
        </div>
      )}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border border-line p-3">
      <h4 className="text-sm text-ink">{title}</h4>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function ReaderInsights({ projectId, phase }: { projectId: string; phase: InsightsPhase }) {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reader-insights?phase=${phase}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load insights");
      setData(json.insights || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load insights");
    } finally {
      setLoading(false);
    }
  }, [projectId, phase]);

  useEffect(() => {
    if (localStorage.getItem(OPEN_KEY) === "0") setOpen(false);
  }, []);

  useEffect(() => {
    if (open && !data) void load();
  }, [open, data, load]);

  function toggle() {
    setOpen((o) => {
      localStorage.setItem(OPEN_KEY, o ? "0" : "1");
      return !o;
    });
  }

  const s = data?.summary;
  const word = phase === "arc" ? "ARC readers" : "beta readers";
  const bestWeekday = data && Math.max(...data.weekdays) > 0 ? data.weekdays.indexOf(Math.max(...data.weekdays)) : -1;
  const readers = data ? (showAll ? data.readers : data.readers.slice(0, READER_PREVIEW)) : [];

  return (
    <section className="font-ui border border-line p-4">
      <button
        type="button"
        className="flex w-full items-baseline justify-between gap-3 text-left"
        onClick={toggle}
        aria-expanded={open}
      >
        <span>
          <span className="font-display block text-lg text-ink">Reader insights</span>
          <span className="text-xs text-muted">
            Who joined when, how far each reader got, how often they come back, and where they stop.
          </span>
        </span>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {loading && !data && <p className="text-sm text-muted">Loading…</p>}
          {error && <p className="text-sm text-danger">{error}</p>}

          {data && s && s.readers === 0 && (
            <p className="text-sm text-muted">
              No {word} yet. Charts appear once readers have access to this book.
            </p>
          )}

          {data && s && s.readers > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                <span>
                  {data.trackedSince
                    ? `Reading days tracked since ${shortDay(data.trackedSince)}.`
                    : "Reading days start tracking the next time a reader opens the book."}
                </span>
                <button
                  type="button"
                  className="text-accent hover:underline disabled:opacity-50"
                  disabled={loading}
                  onClick={() => void load()}
                >
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                <Stat label="Readers" value={s.readers} hint={`${s.started} started`} />
                <Stat
                  label="Finished"
                  value={s.finished}
                  hint={s.completionRate == null ? undefined : `${Math.round(s.completionRate * 100)}% of starters`}
                />
                <Stat label="Read this week" value={s.active7} hint="opened it in the last 7 days" />
                <Stat label="Stalled" value={s.stalled} hint="no reading for 7+ days" />
                {phase === "beta" ? (
                  <Stat label="Did not finish" value={s.dnf} />
                ) : (
                  <Stat label="Behind pace" value={data.arc?.atRisk ?? 0} hint="unlikely to make the deadline" />
                )}
                <Stat label="Average progress" value={`${s.avgBookPercent}%`} hint="of the book, by words" />
                <Stat
                  label="Reading days"
                  value={s.avgReadingDays ?? "—"}
                  hint="average per reader"
                />
                <Stat
                  label="Days to finish"
                  value={s.medianDaysToFinish ?? "—"}
                  hint="median, start to finish"
                />
                {phase === "beta" && <Stat label="Comments" value={s.comments} hint="left by readers" />}
                {phase === "arc" && data.arc && (
                  <Stat
                    label="Deadline"
                    value={
                      data.arc.daysLeft == null
                        ? "None"
                        : data.arc.daysLeft > 0
                          ? `${data.arc.daysLeft}d left`
                          : "Passed"
                    }
                    hint={data.arc.deadline ? shortDate(data.arc.deadline) : undefined}
                  />
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Card
                  title="Readers joined"
                  hint={`New ${word} per ${data.joinedBucket === "week" ? "week" : "day"}, by request or invite date`}
                >
                  <Bars
                    data={data.joined.map((j) => ({
                      label: shortDay(j.start),
                      value: j.count,
                      title: `${data.joinedBucket === "week" ? "Week of " : ""}${shortDay(j.start)}: ${j.count} joined`,
                    }))}
                  />
                </Card>

                <Card title="Readers reading each day" hint="Last 30 days">
                  <Bars
                    data={data.activity.map((a) => ({
                      label: shortDay(a.day),
                      value: a.readers,
                      title: `${shortDay(a.day)}: ${a.readers} reader${a.readers === 1 ? "" : "s"}`,
                    }))}
                  />
                </Card>

                <Card
                  title="How often readers come back"
                  hint="Number of different days each reader opened the book"
                >
                  <ul className="space-y-1.5 text-sm">
                    {data.returns.map((r) => (
                      <li key={r.label} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs text-muted">{r.label}</span>
                        <span className="h-3 flex-1 bg-line/40">
                          <span
                            className="block h-3 bg-accent/70"
                            style={{ width: `${s.started ? (r.readers / s.started) * 100 : 0}%` }}
                          />
                        </span>
                        <span className="w-8 text-right tabular-nums text-ink">{r.readers}</span>
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card
                  title="Which days they read"
                  hint={
                    bestWeekday >= 0
                      ? `${WEEKDAYS[bestWeekday]} is the busiest reading day, a good day to send reminders.`
                      : "Fills in as readers open the book."
                  }
                >
                  <Bars
                    highlight={bestWeekday}
                    data={data.weekdays.map((n, i) => ({
                      label: WEEKDAYS[i],
                      value: n,
                      title: `${WEEKDAYS[i]}: ${n} reading day${n === 1 ? "" : "s"}`,
                    }))}
                  />
                </Card>
              </div>

              <Card
                title="Where readers drop off"
                hint="Light bar: readers who reached the chapter. Dark bar: readers who finished it. Stopped: did not finish or no reading for 7+ days with this as their furthest chapter."
              >
                {data.biggestDrop && (
                  <p className="mb-3 text-sm text-ink">
                    Most readers stop at <strong>{data.biggestDrop.title}</strong> ({data.biggestDrop.stopped}{" "}
                    {data.biggestDrop.stopped === 1 ? "reader" : "readers"}).
                  </p>
                )}
                {data.chapters.length === 0 ? (
                  <p className="text-sm text-muted">No chapters yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.chapters.map((c, i) => (
                      <li key={c.id} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 text-xs">
                        <span className="truncate text-ink" title={c.title}>
                          {i + 1}. {c.title}
                        </span>
                        <span className="relative h-3 bg-line/30">
                          <span
                            className="absolute inset-y-0 left-0 bg-accent/30"
                            style={{ width: `${(c.reached / s.readers) * 100}%` }}
                          />
                          <span
                            className="absolute inset-y-0 left-0 bg-accent/80"
                            style={{ width: `${(c.completed / s.readers) * 100}%` }}
                          />
                        </span>
                        <span className="whitespace-nowrap text-right tabular-nums text-muted">
                          {c.reached} reached
                          {c.stoppedHere > 0 && <span className="text-danger"> · {c.stoppedHere} stopped</span>}
                          {phase === "beta" && c.comments > 0 && <> · {c.comments} comments</>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="How far each reader got" hint="Progress through the whole book, weighted by chapter length">
                <ul className="space-y-2">
                  {readers.map((r) => (
                    <li key={r.id} className="text-xs">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm text-ink">
                          {r.name}{" "}
                          <span className={STATUS_CLASS[r.status]}>· {STATUS_LABEL[r.status]}</span>
                          {r.atRisk && <span className="text-danger"> · behind pace</span>}
                          {r.finishedOnTime === false && <span className="text-danger"> · after deadline</span>}
                        </span>
                        <span className="tabular-nums text-muted">{r.bookPercent}%</span>
                      </div>
                      <span className="mt-1 block h-2 bg-line/30">
                        <span
                          className={`block h-2 ${r.status === "dnf" || r.status === "stalled" ? "bg-danger/60" : "bg-accent/80"}`}
                          style={{ width: `${r.bookPercent}%` }}
                        />
                      </span>
                      <p className="mt-1 text-muted">
                        Joined {shortDate(r.joinedAt)}
                        {r.furthestChapter && <> · furthest: {r.furthestChapter}</>}
                        {" · "}
                        {r.readingDays} reading day{r.readingDays === 1 ? "" : "s"}
                        {r.avgGapDays != null && <> · back every {r.avgGapDays} days</>}
                        {" · "}last read {shortDate(r.lastReadAt)}
                        {phase === "beta" && r.comments > 0 && <> · {r.comments} comments</>}
                        {phase === "arc" && r.reviewsPosted > 0 && (
                          <> · posted {r.reviewsPosted} review{r.reviewsPosted === 1 ? "" : "s"}</>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
                {data.readers.length > READER_PREVIEW && (
                  <button
                    type="button"
                    className="mt-3 text-xs text-accent hover:underline"
                    onClick={() => setShowAll((v) => !v)}
                  >
                    {showAll ? "Show fewer" : `Show all ${data.readers.length} readers`}
                  </button>
                )}
              </Card>

              {phase === "beta" && data.dnfReasons.length > 0 && (
                <Card title="Why readers stopped" hint="Reasons given when marking Did not finish">
                  <ul className="space-y-2 text-sm">
                    {data.dnfReasons.map((d, i) => (
                      <li key={i}>
                        <p className="text-ink">
                          {d.name}
                          <span className="text-xs text-muted">
                            {d.chapter ? ` · at ${d.chapter}` : ""}
                            {d.at ? ` · ${shortDate(d.at)}` : ""}
                          </span>
                        </p>
                        <p className="text-xs text-muted">{d.reason || "No reason given."}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {phase === "arc" && data.arc && (
                <div className="grid gap-3 md:grid-cols-2">
                  <Card title="Deadline" hint="Who finished in time, and who needs a nudge">
                    <ul className="space-y-1 text-sm">
                      <li className="flex justify-between">
                        <span className="text-muted">Finished on time</span>
                        <span className="tabular-nums text-ink">{data.arc.finishedOnTime}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-muted">Finished after the deadline</span>
                        <span className="tabular-nums text-ink">{data.arc.finishedLate}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-muted">Behind pace</span>
                        <span className="tabular-nums text-ink">{data.arc.atRisk}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-muted">Missed the deadline</span>
                        <span className="tabular-nums text-ink">{data.arc.missedDeadline}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-muted">Finished, no review posted yet</span>
                        <span className="tabular-nums text-ink">{data.arc.finishedNoReview}</span>
                      </li>
                    </ul>
                  </Card>
                  <Card title="Reviews posted" hint="Readers who marked a review as posted on each site">
                    {data.arc.reviewSites.length === 0 ? (
                      <p className="text-sm text-muted">Add review links above to track where readers post.</p>
                    ) : (
                      <ul className="space-y-1.5 text-sm">
                        {data.arc.reviewSites.map((site) => (
                          <li key={site.label} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 truncate text-xs text-muted">{site.label}</span>
                            <span className="h-3 flex-1 bg-line/40">
                              <span
                                className="block h-3 bg-accent/70"
                                style={{ width: `${(site.posted / s.readers) * 100}%` }}
                              />
                            </span>
                            <span className="w-8 text-right tabular-nums text-ink">{site.posted}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

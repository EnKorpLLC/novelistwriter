"use client";

import { useEffect, useMemo, useState } from "react";
import { clientLocalDay } from "@/lib/local-day";
import { buildTimeline, daysUntil, fillTemplate, readiness, type LaunchPlanState, type LaunchSignals, type StepStatus } from "@/lib/launch-plan";

type Data = {
  studio: boolean;
  migrationNeeded: boolean;
  title: string;
  releaseDate: string | null;
  launchUrl: string | null;
  state: LaunchPlanState;
  signals: LaunchSignals;
  chapters: { id: string; title: string }[];
  releaseList: number;
  emailsWaiting: number;
};

const STATUS: Record<StepStatus, { label: string; cls: string }> = {
  done: { label: "Done", cls: "text-accent" },
  late: { label: "Late", cls: "text-danger" },
  now: { label: "Do this now", cls: "text-ink font-medium" },
  soon: { label: "Coming up", cls: "text-ink" },
  later: { label: "Later", cls: "text-muted" },
};

function fmt(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** L1: a countdown from the release date with one-click steps and a readiness score (Studio). */
export function LaunchPlan({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [going, setGoing] = useState(false);
  const [waiting, setWaiting] = useState(0);
  // Today's sending budget is used up; the rest goes out in tomorrow's batch
  const [paused, setPaused] = useState(false);
  const today = useMemo(() => clientLocalDay(), []);

  // Keep sending queued launch emails while this tab is open, within the day's Gmail budget
  useEffect(() => {
    if (waiting <= 0 || paused) return;
    const t = setTimeout(async () => {
      const res = await fetch("/api/launch/queue", { method: "POST" }).catch(() => null);
      const json = res && res.ok ? ((await res.json()) as { sent: number; waiting: number }) : null;
      if (!json) return setPaused(true);
      setWaiting(json.waiting);
      if (json.sent === 0) setPaused(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [waiting, paused]);

  async function goLive() {
    if (!data) return;
    if (
      !window.confirm(
        `Announce that ${data.title} is out? This marks it "Out now", emails the ${data.releaseList} reader${data.releaseList === 1 ? "" : "s"} waiting for it and followers who allow email, and asks your ARC readers to post reviews. It can only be sent once.`
      )
    )
      return;
    setGoing(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/launch-live`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not send");
      setData((d) =>
        d
          ? {
              ...d,
              signals: { ...d.signals, published: true },
              state: { ...d.state, liveSentAt: new Date().toISOString(), liveStats: { emails: json.emails, followers: json.followers, arcReaders: json.arcReaders } },
            }
          : d
      );
      setWaiting(json.waiting);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not send");
    } finally {
      setGoing(false);
    }
  }

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/launch-plan`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setNote((await r.json().catch(() => ({}))).error || "Could not load the launch plan")))
      .catch(() => setNote("Could not load the launch plan"));
  }, [projectId]);

  async function save(body: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}/launch-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(json.error || "Could not save");
      return;
    }
    setData((d) => (d ? { ...d, state: json.state } : d));
  }

  useEffect(() => {
    if (data?.emailsWaiting) setWaiting(data.emailsWaiting);
  }, [data?.emailsWaiting]);

  if (!data) return note ? <p className="text-sm text-danger">{note}</p> : null;

  const head = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-display text-lg">Launch plan</h3>
      {!data.studio && <span className="text-xs text-muted">Studio</span>}
    </div>
  );

  const live = (
    <div className="mt-4 border border-line bg-paper-deep/30 p-3 text-sm">
      <p className="font-display text-base">Launch day</p>
      {data.state.liveSentAt ? (
        <>
          <p className="mt-1 text-ink">
            Announced {new Date(data.state.liveSentAt).toLocaleDateString()}: {data.state.liveStats?.emails ?? 0} emails,{" "}
            {data.state.liveStats?.followers ?? 0} followers notified, {data.state.liveStats?.arcReaders ?? 0} ARC readers asked for reviews.
          </p>
          {waiting > 0 && (
            <p className="mt-1 text-xs text-muted">
              {paused
                ? `${waiting} emails wait for tomorrow's batch, to stay under Gmail's daily limit.`
                : `Sending… ${waiting} to go. Keep this tab open to send faster; anything left goes out tomorrow.`}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            {data.releaseList} reader{data.releaseList === 1 ? "" : "s"} asked to hear when it&apos;s out. One click marks the book
            &ldquo;Out now&rdquo;, emails them and followers who allow email, and asks every ARC reader to post their review today.
          </p>
          <button
            type="button"
            disabled={!data.studio || going}
            onClick={() => void goLive()}
            className="mt-2 bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
          >
            {going ? "Sending…" : "We're live: announce it"}
          </button>
        </>
      )}
      <label className="mt-3 flex items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={data.state.spotlight}
          disabled={!data.studio}
          onChange={(e) => void save({ spotlight: e.target.checked })}
        />
        <span>
          Feature this book in &ldquo;Launching this week&rdquo; on the reader catalog and home page during its release week
          (your launch page needs to be public).
        </span>
      </label>
    </div>
  );

  const sample = (
    <div className="mt-4 border-t border-line pt-3 text-xs">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={data.state.sample.on}
          disabled={!data.studio || data.chapters.length === 0}
          onChange={(e) => void save({ sample: { on: e.target.checked, chapterId: data.state.sample.chapterId } })}
        />
        Let visitors read a sample chapter on the launch page
      </label>
      {data.state.sample.on && (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-muted">
          Chapter
          <select
            value={data.state.sample.chapterId || ""}
            onChange={(e) => void save({ sample: { on: true, chapterId: e.target.value || null } })}
            className="border border-line bg-paper px-1.5 py-1 text-ink"
          >
            <option value="">The first chapter</option>
            {data.chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="mt-1 text-muted">It shows before the buy and preorder buttons, so readers can try the book first.</p>
    </div>
  );

  if (!data.releaseDate) {
    return (
      <section className="border border-line p-4">
        {head}
        <p className="mt-1 text-sm text-muted">
          Set a release date below and we&apos;ll build your launch countdown: cover reveal, advance copies, preorders,
          countdown posts, launch day, and reviews, each with a one-click step.
        </p>
        {sample}
      </section>
    );
  }

  const timeline = buildTimeline(data.releaseDate, today, data.state, data.signals);
  const ready = readiness(data.signals, data.state);
  const left = daysUntil(data.releaseDate, today);
  const link = data.launchUrl || "";
  const vars = { title: data.title, date: fmt(data.releaseDate), link };

  return (
    <section className="border border-accent/50 p-4">
      {head}
      <p className="mt-1 text-sm text-ink">
        {left > 0 ? `${left} day${left === 1 ? "" : "s"} to launch` : left === 0 ? "Launch day is today" : `${-left} day${left === -1 ? "" : "s"} since launch`} ·{" "}
        {fmt(data.releaseDate)}
      </p>
      {data.migrationNeeded && <p className="mt-2 text-xs text-danger">Database needs an update. Run supabase/migration_launch_engine.sql in the Supabase SQL editor.</p>}
      {note && <p className="mt-2 text-xs text-danger">{note}</p>}
      {!data.studio && (
        <div className="mt-3 border border-accent/40 bg-accent/5 p-3 text-xs">
          <p className="text-ink">The launch plan is part of Studio. Here&apos;s what yours would look like.</p>
          <a href="/billing" className="mt-2 inline-block bg-accent px-3 py-1.5 text-paper">
            Get Studio
          </a>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted">Launch readiness</span>
          <span className="text-ink">{ready.score}%</span>
        </div>
        <div className="mt-1 h-2 w-full bg-paper-deep">
          <div className="h-2 bg-accent" style={{ width: `${ready.score}%` }} />
        </div>
        <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          {ready.items.map((i) => (
            <li key={i.label} className="flex gap-1.5">
              <span className={i.ok ? "text-accent" : "text-muted"}>{i.ok ? "✓" : "○"}</span>
              <span>
                {i.label}
                {i.detail ? <span className="text-muted"> · {i.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <label className="mt-2 flex items-center gap-2 text-xs text-muted">
          ARC reader goal
          <input
            type="number"
            min={1}
            max={500}
            defaultValue={data.state.arcTarget}
            disabled={!data.studio}
            onBlur={(e) => Number(e.target.value) !== data.state.arcTarget && void save({ arcTarget: Number(e.target.value) })}
            className="w-16 border border-line bg-paper px-1.5 py-0.5 text-ink"
          />
        </label>
      </div>

      {live}

      <ol className="mt-5 space-y-2">
        {timeline.map((s) => {
          const st = STATUS[s.status];
          return (
            <li key={s.id} className={`border p-3 ${s.status === "now" || s.status === "late" ? "border-accent/60" : "border-line"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label className="flex min-w-0 items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={s.status === "done"}
                    disabled={!data.studio || s.autoDone}
                    onChange={(e) => void save({ step: s.id, done: e.target.checked })}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{s.title}</span>
                    <span className="block text-xs text-muted">{s.detail}</span>
                    {s.autoDone && <span className="block text-[11px] text-accent">Done: your book already shows this.</span>}
                  </span>
                </label>
                <span className="shrink-0 text-right text-xs">
                  <span className="block text-muted">{fmt(s.due)}</span>
                  <span className={`block ${st.cls}`}>{st.label}</span>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 pl-6 text-xs">
                {s.action?.tab && (
                  <a href={`?tab=${s.action.tab}`} className="text-accent underline">
                    {s.action.label}
                  </a>
                )}
                {s.action?.countdown !== undefined && (
                  <>
                    <a href={`/api/projects/${projectId}/countdown-image?days=${s.action.countdown}&size=square`} className="text-accent underline">
                      Square countdown image
                    </a>
                    <a href={`/api/projects/${projectId}/countdown-image?days=${s.action.countdown}`} className="text-accent underline">
                      Wide image
                    </a>
                  </>
                )}
                {s.template && (
                  <button type="button" className="text-accent underline" onClick={() => setOpen(open === s.id ? null : s.id)}>
                    {open === s.id ? "Hide post" : "Post to share"}
                  </button>
                )}
              </div>
              {open === s.id && s.template && (
                <div className="mt-2 pl-6">
                  <textarea readOnly rows={3} value={fillTemplate(s.template, vars)} className="w-full border border-line bg-paper-deep/40 p-2 text-xs text-ink" />
                  <button
                    type="button"
                    className="text-xs text-accent underline"
                    onClick={() => {
                      void navigator.clipboard.writeText(fillTemplate(s.template!, vars)).then(() => {
                        setCopied(s.id);
                        setTimeout(() => setCopied(null), 1600);
                      });
                    }}
                  >
                    {copied === s.id ? "Copied" : "Copy, then edit it in your own words"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11px] text-muted">Change the release date and every step moves with it. Missed steps stay on the list as late.</p>
      {sample}
    </section>
  );
}

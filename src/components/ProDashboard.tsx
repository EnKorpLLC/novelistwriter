"use client";

import { useCallback, useEffect, useState } from "react";
import { HUMAN_PROMISE, MARKET_TYPES, PORTFOLIO_MAX, type MarketGroup, type MarketTypeStatus, type PortfolioItem } from "@/lib/market-types";

type Item = PortfolioItem & { imageUrl?: string | null };
type Profile = {
  name: string;
  headline: string;
  bio: string;
  specialties: string[];
  genres: string[];
  rateNote: string;
  turnaroundNote: string;
  website: string;
  portfolio: Item[];
  status: string;
  promised: boolean;
  adminNote: string;
  founding: boolean;
};
type Data = { profile: Profile | null; types: MarketTypeStatus[]; inviteUrl?: string | null; recruited?: number; storageReady?: boolean; migrationNeeded?: boolean; error?: string };

const STATUS: Record<string, string> = {
  draft: "Not sent yet. Finish your profile and send it for review.",
  applied: "Sent. We review every profile by hand and will let you know.",
  changes: "We asked for a few changes. Update your profile and send it again.",
  approved: "Approved.",
  declined: "Not approved this time. You can update your profile and send it again.",
  paused: "Paused: you're hidden from authors until you resume.",
  removed: "Removed from the marketplace.",
};

const newId = () => Math.random().toString(36).slice(2, 10);
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const JOB_STATUS: Record<string, string> = {
  requested: "New request: send a quote",
  quoted: "Quote sent",
  agreed: "In progress",
  completed: "Complete",
  cancelled: "Cancelled",
  declined: "You passed",
  not_chosen: "Went to another pro",
  disputed: "Paused (we're looking at it)",
};

/** Requests and jobs, newest activity first. */
function ProJobs() {
  const [jobs, setJobs] = useState<{ id: string; title: string; type: string; status: string; other: string }[] | null>(null);
  useEffect(() => {
    void fetch("/api/market/jobs")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => setJobs(d?.working || []))
      .catch(() => setJobs([]));
  }, []);
  if (!jobs?.length) return null;
  return (
    <section>
      <h2 className="font-display text-xl">Requests and jobs</h2>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {jobs.map((j) => (
          <li key={j.id}>
            <a href={`/hire/job/${j.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-accent">
              <span>
                <span className="text-ink">{j.title}</span>
                <span className="text-xs text-muted">
                  {" "}
                  · {j.type} · {j.other}
                </span>
              </span>
              <span className={`text-xs ${j.status === "requested" ? "text-accent" : "text-muted"}`}>{JOB_STATUS[j.status] || j.status}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Where marketplace pay goes: the same Stripe payout account narrators and sellers use. */
function ProPayouts() {
  const [d, setD] = useState<{ hasAccount: boolean; payoutsEnabled: boolean; paidCents: number; waitingCents: number; migrationNeeded?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/pro/payouts")
      .then(async (r) => (r.ok ? r.json() : null))
      .then(setD)
      .catch(() => null);
  }, []);
  async function go(action: "onboard" | "stripe_dashboard") {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/pro/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok && j.url) window.location.href = j.url;
    else setErr(j.error || "Stripe isn't available right now.");
  }
  if (!d || d.migrationNeeded) return null;
  return (
    <section className="border border-line p-4">
      <h2 className="font-display text-xl">Getting paid</h2>
      {d.payoutsEnabled ? (
        <p className="mt-1">
          <span className="text-accent">✓ Payouts are set up.</span> {usd(d.paidCents)} paid to you so far{d.waitingCents ? `; ${usd(d.waitingCents)} on its way` : ""}.{" "}
          <button type="button" className="text-accent underline" disabled={busy} onClick={() => void go("stripe_dashboard")}>
            Open Stripe
          </button>
        </p>
      ) : (
        <>
          <p className="mt-1 text-muted">Set up payouts with Stripe (bank details and the tax info it needs) so approved milestones reach you right away.</p>
          {d.waitingCents > 0 && <p className="mt-1 text-ink">{usd(d.waitingCents)} is waiting for you.</p>}
          <button type="button" disabled={busy} className="mt-2 bg-accent px-4 py-2 text-paper disabled:opacity-60" onClick={() => void go("onboard")}>
            {d.hasAccount ? "Finish payout setup" : "Set up payouts"}
          </button>
        </>
      )}
      {err && <p className="mt-1 text-danger">{err}</p>}
    </section>
  );
}

/** The pro's own page: profile and portfolio, application status, how their types are filling up, and their invite link. */
export function ProDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [p, setP] = useState<Profile | null>(null);
  const [genres, setGenres] = useState("");
  const [promise, setPromise] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/pro").catch(() => null);
    const d = (r?.ok ? await r.json() : null) as Data | null;
    if (!d) return;
    setData(d);
    if (d.profile) {
      setP(d.profile);
      setGenres(d.profile.genres.join(", "));
      setPromise(d.profile.promised);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/pro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Something went wrong");
    return d as Record<string, unknown>;
  }

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMsg(null);
    try {
      const done = await fn();
      if (done) setMsg({ ok: true, text: done });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  }

  const body = () => ({ ...p, genres, portfolio: p?.portfolio.map(({ imageUrl: _drop, ...i }) => i) });

  async function addImage(file: File) {
    if (!p) return;
    await run("image", async () => {
      const up = await post({ action: "upload_url", name: file.name });
      const put = await fetch(String(up.url), { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
      if (!put.ok) throw new Error(`The image didn't upload (${put.status}). Try again.`);
      const item: Item = { id: newId(), title: file.name.replace(/\.[^.]+$/, ""), note: "", key: String(up.key) };
      await post({ action: "save", ...body(), portfolio: [...(body().portfolio || []), item] });
      return "Image added.";
    });
  }

  if (!data) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  if (data.migrationNeeded) return <p className="mt-6 text-sm text-danger">{data.error}</p>;
  if (!data.profile || !p) {
    return (
      <section className="mt-6 border border-accent p-5 text-sm">
        <p>Set up a pro profile to be listed for authors to hire: editing, art, or narration.</p>
        <button type="button" disabled={Boolean(busy)} className="mt-3 bg-accent px-4 py-2 text-paper" onClick={() => void run("start", async () => void (await post({ action: "start" })))}>
          Start my pro profile
        </button>
        {msg && <p className="mt-2 text-danger">{msg.text}</p>}
      </section>
    );
  }

  const set = (patch: Partial<Profile>) => setP({ ...p, ...patch });
  const setItem = (id: string, patch: Partial<Item>) => set({ portfolio: p.portfolio.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const groups = [...new Set(p.specialties.map((s) => MARKET_TYPES.find((t) => t.id === s)?.group).filter(Boolean))] as MarketGroup[];
  const mine = data.types.filter((t) => p.specialties.includes(t.id));
  const editing = groups.includes("editing");
  const canSend = ["draft", "changes", "declined"].includes(p.status);
  const input = "mt-1 block w-full border border-line bg-paper px-3 py-2 text-sm text-ink";

  return (
    <div className="mt-6 space-y-8 text-sm">
      <ProJobs />
      <ProPayouts />
      <section className={`border p-4 ${p.status === "approved" ? "border-accent" : "border-line"}`}>
        <p className="text-ink">
          <strong>Status:</strong> {STATUS[p.status] || p.status}
          {p.founding && <span className="ml-2 border border-accent px-1.5 py-0.5 text-[11px] text-accent">Founding pro</span>}
        </p>
        {p.adminNote && ["changes", "declined", "removed"].includes(p.status) && <p className="mt-1 text-muted">Note from us: {p.adminNote}</p>}
        {p.status === "approved" && (
          <button type="button" className="mt-2 text-xs text-muted underline" disabled={Boolean(busy)} onClick={() => void run("pause", async () => void (await post({ action: "pause" })))}>
            Pause my profile (taking a break)
          </button>
        )}
        {p.status === "paused" && (
          <button type="button" className="mt-2 text-xs text-accent underline" disabled={Boolean(busy)} onClick={() => void run("resume", async () => void (await post({ action: "resume" })))}>
            Resume
          </button>
        )}
      </section>

      {mine.length > 0 && (
        <section>
          <h2 className="font-display text-xl">Opening to authors</h2>
          <ul className="mt-2 space-y-2">
            {mine.map((t) => (
              <li key={t.id} className="border border-line px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-ink">{t.plural}</span>
                  <span className="text-xs text-muted">
                    {t.state === "open" ? "Open to authors" : t.state === "ready" ? "Ready: opening soon" : `${Math.min(t.approved, t.threshold)} of ${t.threshold} founding pros`}
                    {t.waiting > 0 ? ` · ${t.waiting} ${t.waiting === 1 ? "author" : "authors"} waiting` : ""}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 bg-line">
                  <div className="h-1.5 bg-accent" style={{ width: `${Math.min(100, Math.round((t.approved / Math.max(1, t.threshold)) * 100))}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {data.inviteUrl && (
            <div className="mt-3 border border-line p-3">
              <p className="text-ink">Invite other pros to open it sooner</p>
              <p className="mt-1 text-xs text-muted">Share your link with editors, artists, or narrators you&apos;d vouch for. {data.recruited ? `${data.recruited} joined through you so far.` : ""}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input readOnly value={data.inviteUrl} className="w-full max-w-md border border-line bg-paper px-2 py-1 text-xs" onFocus={(e) => e.target.select()} />
                <button type="button" className="border border-accent px-3 py-1 text-xs text-accent" onClick={() => void navigator.clipboard.writeText(data.inviteUrl!).then(() => setMsg({ ok: true, text: "Link copied." }))}>
                  Copy
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl">Your profile</h2>
        <fieldset>
          <legend className="text-xs text-muted">What you do (pick any)</legend>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {MARKET_TYPES.map((t) => (
              <label key={t.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={p.specialties.includes(t.id)}
                  onChange={(e) => set({ specialties: e.target.checked ? [...p.specialties, t.id] : p.specialties.filter((s) => s !== t.id) })}
                />
                <span>
                  {t.label}
                  <span className="block text-[11px] text-muted">{t.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-xs text-muted">
          Name
          <input value={p.name} onChange={(e) => set({ name: e.target.value })} className={input} />
        </label>
        <label className="block text-xs text-muted">
          Headline (one line authors see first)
          <input value={p.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="Line editor for epic fantasy and romantasy" className={input} />
        </label>
        <label className="block text-xs text-muted">
          About you and how you work
          <textarea value={p.bio} onChange={(e) => set({ bio: e.target.value })} rows={5} className={input} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-muted">
            Genres (comma separated)
            <input value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="Fantasy, romance, thriller" className={input} />
          </label>
          <label className="block text-xs text-muted">
            Your website or portfolio link
            <input value={p.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" className={input} />
          </label>
          <label className="block text-xs text-muted">
            Typical rates
            <input value={p.rateNote} onChange={(e) => set({ rateNote: e.target.value })} placeholder="From $0.02 per word, or $450 per cover" className={input} />
          </label>
          <label className="block text-xs text-muted">
            Typical turnaround
            <input value={p.turnaroundNote} onChange={(e) => set({ turnaroundNote: e.target.value })} placeholder="3 to 4 weeks for 90,000 words" className={input} />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Portfolio</h2>
        <p className="text-xs text-muted">
          At least two pieces (or a portfolio link above).{editing ? " Editors: a short before-and-after sample shows authors how you work (use text you have the right to share)." : ""}{" "}
          Up to {PORTFOLIO_MAX}.
        </p>
        <ul className="space-y-3">
          {p.portfolio.map((i) => (
            <li key={i.id} className="space-y-2 border border-line p-3">
              <div className="flex flex-wrap gap-3">
                {i.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.imageUrl} alt="" className="h-24 w-24 border border-line object-cover" />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <input value={i.title} onChange={(e) => setItem(i.id, { title: e.target.value })} placeholder="Title" className={input} />
                  <input value={i.note} onChange={(e) => setItem(i.id, { note: e.target.value })} placeholder="A line about it (book, genre, what you did)" className={input} />
                  {!i.key && <input value={i.url || ""} onChange={(e) => setItem(i.id, { url: e.target.value })} placeholder="Link (optional), https://" className={input} />}
                </div>
              </div>
              {editing && !i.key && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <textarea value={i.before || ""} onChange={(e) => setItem(i.id, { before: e.target.value })} rows={4} placeholder="Before" className={input} />
                  <textarea value={i.after || ""} onChange={(e) => setItem(i.id, { after: e.target.value })} rows={4} placeholder="After" className={input} />
                </div>
              )}
              <button type="button" className="text-xs text-danger underline" onClick={() => set({ portfolio: p.portfolio.filter((x) => x.id !== i.id) })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        {p.portfolio.length < PORTFOLIO_MAX && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="border border-line px-3 py-1.5 text-xs" onClick={() => set({ portfolio: [...p.portfolio, { id: newId(), title: "", note: "" }] })}>
              Add a link{editing ? " or sample" : ""}
            </button>
            {data.storageReady && (
              <label className="cursor-pointer border border-line px-3 py-1.5 text-xs">
                {busy === "image" ? "Uploading…" : "Add an image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={Boolean(busy)}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void addImage(f);
                  }}
                />
              </label>
            )}
          </div>
        )}
      </section>

      {groups.length > 0 && (
        <section className="border border-line p-4">
          <h2 className="font-display text-xl">The human-made promise</h2>
          <ul className="mt-2 space-y-2 text-muted">
            {groups.map((g) => (
              <li key={g}>{HUMAN_PROMISE[g]}</li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={promise} disabled={p.promised} onChange={(e) => setPromise(e.target.checked)} />
            <span>I promise. If my work isn&apos;t human-made, the author is refunded in full and I&apos;m removed from the marketplace.</span>
          </label>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={Boolean(busy)}
          className="border border-line px-4 py-2 disabled:opacity-60"
          onClick={() => void run("save", async () => (await post({ action: "save", ...body() }), "Saved."))}
        >
          {busy === "save" ? "Saving…" : "Save"}
        </button>
        {canSend && (
          <button
            type="button"
            disabled={Boolean(busy)}
            className="bg-accent px-4 py-2 text-paper disabled:opacity-60"
            onClick={() =>
              void run("submit", async () => {
                const d = await post({ action: "submit", ...body(), promise });
                return d.status === "approved" ? "You're in: approved as a founding pro." : "Sent for review. We'll let you know.";
              })
            }
          >
            {busy === "submit" ? "Sending…" : "Send my application"}
          </button>
        )}
        {msg && <span className={`text-xs ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

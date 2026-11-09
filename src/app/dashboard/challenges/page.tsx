"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Challenge = { id: string; slug: string; title: string; goal_words: number; starts_on: string; ends_on: string; kind: string; join_code: string | null };
type Progress = { verified_words: number; current_streak: number; completed_at: string | null };
type Item = { challenge: Challenge; status: "upcoming" | "active" | "ended"; progress?: Progress };

function fmt(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function isoDay(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardChallengesPage() {
  const [data, setData] = useState<{ joined: Item[]; created: Item[]; open: Item[] } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", goal_words: 30000, starts_on: isoDay(1), ends_on: isoDay(30), description: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/challenges");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(json.error || "Could not load challenges");
      return;
    }
    setData(json);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create the challenge");
      window.location.href = `/challenges/${json.challenge.slug}`;
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not create the challenge");
      setBusy(false);
    }
  }

  async function join(slug: string) {
    const res = await fetch(`/api/challenges/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    if (!res.ok) setNote((await res.json().catch(() => ({}))).error || "Could not join");
    await load();
  }

  const input = "mt-1 block w-full border border-line bg-paper px-3 py-2 text-sm text-ink";

  return (
    <div className="font-ui mx-auto min-h-screen max-w-4xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-accent hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-3 text-3xl">Writing challenges</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Only words you type in the editor count, so every total is real. Join a public challenge or start one with your
        writing group, on any dates you like.{" "}
        <Link href="/challenges" className="text-accent underline">
          See all public challenges
        </Link>
      </p>
      {note && <p className="mt-3 text-sm text-danger">{note}</p>}

      {data && (
        <>
          <section className="mt-8">
            <h2 className="font-display text-xl">Your challenges</h2>
            {data.joined.length === 0 && data.created.length === 0 ? (
              <p className="mt-2 text-sm text-muted">You haven&apos;t joined one yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {[...data.joined, ...data.created].map(({ challenge: c, status, progress }) => {
                  const pct = progress ? Math.min(100, Math.round((progress.verified_words / c.goal_words) * 100)) : 0;
                  return (
                    <li key={c.id} className="border border-line p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/challenges/${c.slug}`} className="font-display text-lg hover:text-accent">
                          {c.title}
                        </Link>
                        <span className="text-xs text-muted">
                          {status === "active" ? "Running" : status === "upcoming" ? "Starts" : "Ended"} · {fmt(c.starts_on)} – {fmt(c.ends_on)}
                          {c.kind === "group" ? " · Group" : ""}
                        </span>
                      </div>
                      {progress && (
                        <>
                          <div className="mt-2 h-2 w-full bg-paper-deep">
                            <div className="h-2 bg-accent" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-muted">
                            {progress.verified_words.toLocaleString()} of {c.goal_words.toLocaleString()} verified words
                            {progress.current_streak > 1 ? ` · ${progress.current_streak}-day streak` : ""}
                            {progress.completed_at ? " · Winner" : ""}
                          </p>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {data.open.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl">Open to join</h2>
              <ul className="mt-3 space-y-2">
                {data.open.map(({ challenge: c, status }) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border border-line px-4 py-3 text-sm">
                    <span>
                      <Link href={`/challenges/${c.slug}`} className="text-ink hover:text-accent">
                        {c.title}
                      </Link>
                      <span className="block text-xs text-muted">
                        {status === "active" ? "Running now" : "Starts"} · {fmt(c.starts_on)} – {fmt(c.ends_on)} · {c.goal_words.toLocaleString()} words
                      </span>
                    </span>
                    <button type="button" onClick={() => void join(c.slug)} className="bg-accent px-3 py-1.5 text-xs text-paper">
                      Join
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="mt-10 border border-line p-5">
        <h2 className="font-display text-xl">Start a group challenge</h2>
        <p className="mt-1 text-xs text-muted">For your writing group, class, or friends. It&apos;s private: people join with your invite link.</p>
        <form onSubmit={(e) => void create(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted sm:col-span-2">
            Name
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Spring Sprint with the Thursday group" className={input} />
          </label>
          <label className="text-xs text-muted">
            Starts
            <input type="date" required value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} className={input} />
          </label>
          <label className="text-xs text-muted">
            Ends
            <input type="date" required value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} className={input} />
          </label>
          <label className="text-xs text-muted">
            Word goal
            <input type="number" min={100} max={1000000} step={100} required value={form.goal_words} onChange={(e) => setForm({ ...form, goal_words: Number(e.target.value) })} className={input} />
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            Note for the group (optional)
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50">
              {busy ? "Creating…" : "Create and get the invite link"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

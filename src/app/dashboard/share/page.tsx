"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ShareKit } from "@/components/ShareKit";

type PassData = {
  paidStudio: boolean;
  bankDays: number;
  activeUntil: string | null;
  passActive: boolean;
  daysLeft: number;
  cap: number;
  stats: { visitsToday: number; visits30: number; readerJoins: number; authorSignups: number; daysEarned: number };
  history: { days: number; reason: string; createdAt: string }[];
};

const REASON_LABEL: Record<string, string> = {
  visits: "20 visitors through your link in a day",
  reader_join: "A reader you sent opened a manuscript",
  author_signup: "An author you invited wrote 1,000 words",
  reader_regular: "A reader you brought keeps coming back",
  reader_accepted_elsewhere: "A reader you brought joined another author's book",
  pass_started: "Started your Studio pass",
  returned_on_subscribe: "Unused pass days returned when you subscribed",
};

const RULES = [
  ["1 day", "for every 20 different people who visit through your links in a day (up to 1 day a day)"],
  ["1 day", "each time a reader you sent opens a beta or ARC manuscript (up to 3 a day)"],
  ["7 days", "when an author who signed up through your link writes their first 1,000 words"],
  ["2 days", "when a reader who joined through your link reads on 5 different days in their first 60 days"],
  ["3 days", "when that reader reaches 15 reading days"],
  ["2 days", "the first time that reader is accepted as a beta or ARC reader on another author's book"],
];

export default function ShareAndEarnPage() {
  const [data, setData] = useState<PassData | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [passRes, profileRes] = await Promise.all([fetch("/api/studio-pass"), fetch("/api/profile/public")]);
    const pass = await passRes.json();
    if (!passRes.ok) {
      setError(pass.error || "Could not load");
      return;
    }
    setData(pass);
    if (profileRes.ok) setHandle((await profileRes.json()).handle || null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not start");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/dashboard" className="font-ui text-sm text-accent">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-6 text-3xl">Share &amp; earn</h1>
      <p className="font-ui mt-2 text-sm text-muted">
        Bring readers and writers to Novelist Writer and earn free days of Studio: the beta desk, ARC
        desk, and audience lists. Pass days don&apos;t include AI credits. You can bank up to{" "}
        {data?.cap ?? 28} days.
      </p>
      {error && <p className="font-ui mt-4 text-sm text-danger">{error}</p>}
      {!data && !error && <p className="font-ui mt-6 text-sm text-muted">Loading…</p>}

      {data && (
        <div className="font-ui mt-8 space-y-8">
          <section className="grid gap-4 border border-line p-5 sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Banked</p>
              <p className="font-display text-3xl">{data.bankDays}</p>
              <p className="text-xs text-muted">day{data.bankDays === 1 ? "" : "s"} saved</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Running</p>
              <p className="font-display text-3xl">{data.passActive ? data.daysLeft : 0}</p>
              <p className="text-xs text-muted">
                {data.passActive && data.activeUntil
                  ? `until ${new Date(data.activeUntil).toLocaleString()}`
                  : data.paidStudio
                    ? "you're on paid Studio"
                    : "no pass running"}
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2">
              {data.bankDays > 0 && !data.paidStudio && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void start()}
                  className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
                >
                  {busy ? "Starting…" : `Start ${data.bankDays} day${data.bankDays === 1 ? "" : "s"} now`}
                </button>
              )}
              <p className="text-xs text-muted">
                {data.paidStudio
                  ? "Your banked days start on their own if your Studio subscription ever ends."
                  : "Once started, days run back to back. Days you earn meanwhile go back in the bank."}
              </p>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-4">
            {(
              [
                ["Visitors today", data.stats.visitsToday],
                ["Visitors (30 days)", data.stats.visits30],
                ["Readers sent", data.stats.readerJoins],
                ["Days earned", data.stats.daysEarned],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="border border-line px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
                <p className="font-display text-2xl">{n}</p>
              </div>
            ))}
          </section>

          <section className="space-y-6">
            {handle && (
              <div className="border border-line p-4">
                <ShareKit
                  heading="Share your author site"
                  path={`/a/${handle}`}
                  title="My books on Novelist Writer"
                  posts={[{ label: "Profile", text: "All my books, beta reads, and advance copies in one place:" }]}
                />
              </div>
            )}
            <div className="border border-line p-4">
              <ShareKit
                heading="Invite another writer"
                path="/signup"
                title="Novelist Writer"
                posts={[
                  {
                    label: "Invite",
                    text: "I write on Novelist Writer: it tracks how you wrote your book so you can prove it's yours, and it runs beta and ARC readers too.",
                  },
                ]}
              />
            </div>
            <p className="text-xs text-muted">
              Every book&apos;s Launch, Beta, and ARC tab has share tools too. All of them carry your
              link.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl">How you earn</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {RULES.map(([days, rule]) => (
                <li key={rule} className="flex gap-3">
                  <span className="w-14 shrink-0 font-medium text-accent">{days}</span>
                  <span className="text-ink">{rule}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Up to 8 days per reader you bring. Your own visits and bots don&apos;t count, and only
              accounts created through your link count as yours.
            </p>
          </section>

          {data.history.length > 0 && (
            <section>
              <h2 className="font-display text-xl">History</h2>
              <ul className="mt-3 divide-y divide-line border border-line text-sm">
                {data.history.map((h, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-2">
                    <span className="text-ink">{REASON_LABEL[h.reason] || h.reason}</span>
                    <span className={h.days < 0 ? "text-muted" : "text-accent"}>
                      {h.days > 0 ? `+${h.days}` : h.days} · {new Date(h.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

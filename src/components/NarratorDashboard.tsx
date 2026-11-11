"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dollars, estimateCost, normalizeTerms, type NarrationTerms } from "@/lib/narration";

type Job = {
  id: string;
  status: "invited" | "active" | "declined" | "cancelled" | "completed";
  book: string;
  author: string;
  terms: NarrationTerms;
  inviteToken: string | null;
  chapters: number;
  recorded: number;
  approved: number;
  narratorAcceptedAt: string | null;
  createdAt: string;
};

type PayoutInfo = { hasAccount: boolean; payoutsEnabled: boolean; paidCents: number; waitingCents: number; payouts: { amountCents: number; status: string; reason: string; createdAt: string }[]; migrationNeeded?: boolean };

/** Payout setup through Stripe (the same kind of account sellers and affiliates use), and what's been paid. */
function Payouts() {
  const [info, setInfo] = useState<PayoutInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/narration/payouts")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => null);
  }, []);
  async function go(action: "onboard" | "stripe_dashboard") {
    setBusy(true);
    setMsg(null);
    const d = await fetch("/api/narration/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
      .then((r) => r.json())
      .catch(() => ({ error: "Stripe isn't available right now." }));
    if (d.url) window.location.href = d.url;
    else {
      setMsg(d.error || "Couldn't open Stripe");
      setBusy(false);
    }
  }
  return (
    <section className="border border-line p-4 text-sm">
      <h2 className="font-display text-lg">Getting paid</h2>
      {!info ? (
        <p className="mt-1 text-muted">Loading…</p>
      ) : info.migrationNeeded ? (
        <p className="mt-1 text-danger">Payouts need a database update (migration_narration_payments.sql).</p>
      ) : (
        <>
          <p className="mt-1 text-muted">
            Authors pay a deposit when they approve your checkpoint and the balance when the book is finished. Novelist Writer holds it and sends your full fee to your bank through Stripe; our 10% is paid by the author, on top.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {info.payoutsEnabled ? (
              <>
                <span className="text-accent">✓ Payouts are set up</span>
                <button type="button" disabled={busy} className="border border-line px-3 py-1.5 text-xs" onClick={() => void go("stripe_dashboard")}>
                  Open Stripe
                </button>
              </>
            ) : (
              <button type="button" disabled={busy} className="bg-accent px-3 py-1.5 text-xs text-paper disabled:opacity-60" onClick={() => void go("onboard")}>
                {info.hasAccount ? "Finish setting up payouts" : "Set up payouts with Stripe"}
              </button>
            )}
            <span className="text-xs text-muted">
              Paid {dollars(info.paidCents)}
              {info.waitingCents > 0 ? ` · ${dollars(info.waitingCents)} waiting${info.payoutsEnabled ? " (sending soon)" : " for your payout setup"}` : ""}
            </span>
          </div>
          {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
          {info.payouts.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {info.payouts.slice(0, 10).map((p, i) => (
                <li key={i}>
                  {new Date(p.createdAt).toLocaleDateString()} · {dollars(p.amountCents)} · {p.reason} · {p.status === "paid" ? "sent" : p.status === "cancelled" ? "held (payment disputed)" : "waiting"}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

const payLine = (t: NarrationTerms) =>
  t.pay === "per_finished_hour" ? `${dollars(t.rateCents)} per finished hour · about ${dollars(estimateCost(t).fee)}` : `${t.sharePct}% royalty share for ${t.shareYears} years`;

/** /narrator: invites to answer, books under way, and (soon) payouts. */
export function NarratorDashboard() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/narration/jobs")
      .then((r) => r.json())
      .then((d) => {
        if (d.migrationNeeded) setHint("Narrator accounts need a database update (migration_narrators.sql).");
        setJobs(((d.jobs || []) as Job[]).map((j) => ({ ...j, terms: normalizeTerms(j.terms) })));
      })
      .catch(() => setJobs([]));
  }, []);

  if (!jobs) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  const invites = jobs.filter((j) => j.status === "invited");
  const active = jobs.filter((j) => j.status === "active");
  const past = jobs.filter((j) => j.status !== "invited" && j.status !== "active");

  return (
    <div className="mt-6 space-y-8">
      {hint && <p className="text-sm text-danger">{hint}</p>}

      {invites.length > 0 && (
        <section>
          <h2 className="font-display text-xl">Invites</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {invites.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>
                  <b>{j.book}</b> <span className="text-muted">by {j.author} · {payLine(j.terms)}</span>
                </span>
                {j.inviteToken && (
                  <Link href={`/narrate/${j.inviteToken}`} className="bg-accent px-3 py-1.5 text-xs text-paper">
                    Read and answer
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-xl">Your books</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No books under way yet. When an author invites you, it shows up here.</p>
        ) : (
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {active.map((j) => (
              <li key={j.id} className="border border-line p-4 text-sm">
                <p className="font-display text-lg">{j.book}</p>
                <p className="text-muted">by {j.author}</p>
                <p className="mt-2 text-xs text-muted">{payLine(j.terms)}</p>
                <div className="mt-2 h-1.5 w-full bg-line" aria-label="Chapters recorded">
                  <div className="h-full bg-accent" style={{ width: `${j.chapters ? Math.min(100, (j.recorded / j.chapters) * 100) : 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {j.recorded} of {j.chapters} chapters recorded · {j.approved} approved
                  {j.terms.deadline ? ` · due ${j.terms.deadline}` : ""}
                </p>
                <p className="mt-1 text-xs text-ink">
                  Next:{" "}
                  {j.recorded === 0
                    ? j.terms.checkpoint
                      ? "record about 15 minutes for the author's checkpoint"
                      : "start recording"
                    : j.approved < j.chapters
                      ? "keep recording, and fix any notes the author pins"
                      : "all chapters approved"}
                </p>
                <Link href={`/narrator/book/${j.id}`} className="mt-3 inline-block bg-accent px-3 py-1.5 text-xs text-paper">
                  Open the studio
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Payouts />

      {past.length > 0 && (
        <section>
          <h2 className="font-display text-xl">Past</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {past.map((j) => (
              <li key={j.id}>
                {j.book} by {j.author} · {j.status}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

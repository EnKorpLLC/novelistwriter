"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Summary = {
  signups: number;
  payingCustomers: number;
  onHoldCents: number;
  readyCents: number;
  paidCents: number;
  recent: { createdAt: string; amountCents: number; status: string; availableAt: string; note: string }[];
  payouts: { createdAt: string; amountCents: number; status: string }[];
};
type Data = {
  status: "none" | "applied" | "approved" | "rejected" | "suspended";
  migrationNeeded?: boolean;
  error?: string;
  adminNote?: string;
  countries: { code: string; name: string }[];
  country?: string;
  hasPayoutAccount?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  link?: string | null;
  signupLink?: string | null;
  summary?: Summary | null;
};

const input = "mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink";
const money = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function AffiliatePage() {
  const [data, setData] = useState<Data | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState({ website: "", audience: "", agree: false });
  const [country, setCountry] = useState("US");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/affiliate");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setNote(json.error || "Could not load");
    setData(json);
    if (json.country) setCountry(json.country);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/affiliate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not apply");
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not apply");
    } finally {
      setBusy(false);
    }
  }

  async function stripe(method: "POST" | "GET") {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/affiliate/connect", { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ country }) : undefined });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || "Could not open Stripe");
      window.location.href = json.url;
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not open Stripe");
      setBusy(false);
    }
  }

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="font-ui mx-auto min-h-screen max-w-4xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-accent hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-3 text-3xl">Affiliate program</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Earn 30% of what writers you refer pay for Pro or Studio in their first 12 months, paid monthly to your bank.{" "}
        <Link href="/affiliates" className="text-accent underline">
          How it works and the rules
        </Link>
      </p>
      {note && <p className="mt-4 text-sm text-danger">{note}</p>}
      {!data && !note && <p className="mt-6 text-sm text-muted">Loading…</p>}
      {data?.migrationNeeded && <p className="mt-6 text-sm text-danger">{data.error}</p>}

      {data && !data.migrationNeeded && (data.status === "none" || data.status === "rejected") && (
        <form onSubmit={apply} className="mt-8 max-w-2xl space-y-4 border border-line p-5">
          <h2 className="font-display text-xl">Apply</h2>
          {data.status === "rejected" && (
            <p className="text-sm text-muted">
              Your last application wasn&apos;t approved{data.adminNote ? `: ${data.adminNote}` : "."} You&apos;re welcome to apply again.
            </p>
          )}
          <label className="block text-xs text-muted">
            Your website, channel, or main profile (optional)
            <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} className={input} placeholder="https://" />
          </label>
          <label className="block text-xs text-muted">
            Where and how will you share Novelist Writer? Who&apos;s your audience?
            <textarea rows={4} required value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))} className={input} placeholder="I run a writing-craft YouTube channel for fantasy authors (12k subscribers) and a monthly newsletter." />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={form.agree} onChange={(e) => setForm((f) => ({ ...f, agree: e.target.checked }))} />
            <span>
              I&apos;ve read the{" "}
              <Link href="/affiliates" target="_blank" className="text-accent underline">
                program rules
              </Link>
              , including saying I&apos;m an affiliate wherever I share my link.
            </span>
          </label>
          <button type="submit" disabled={busy} className="bg-accent px-5 py-2 text-sm text-paper disabled:opacity-50">
            Send application
          </button>
        </form>
      )}

      {data?.status === "applied" && (
        <p className="mt-8 border border-line p-5 text-sm">Thanks for applying. We review every application by hand, usually within a few days, and you&apos;ll get a notice either way.</p>
      )}
      {data?.status === "suspended" && (
        <p className="mt-8 border border-danger/40 p-5 text-sm">
          Your affiliate account is paused, so new commissions aren&apos;t being earned. Questions? Reach us through the{" "}
          <Link href="/contact" className="text-accent underline">
            contact page
          </Link>
          .
        </p>
      )}

      {data?.status === "approved" && data.summary && (
        <>
          <section className="mt-8 border border-line p-5">
            <h2 className="font-display text-xl">Your link</h2>
            <p className="mt-1 text-xs text-muted">Anyone who signs up within 30 days of clicking it counts as yours. Say you&apos;re an affiliate when you share it.</p>
            {[data.link, data.signupLink].filter(Boolean).map((l) => (
              <div key={l} className="mt-3 flex flex-wrap items-center gap-3">
                <code className="break-all bg-paper-deep/50 px-2 py-1 text-sm">{l}</code>
                <button type="button" className="text-sm text-accent underline" onClick={() => copy(l!)}>
                  {copied === l ? "Copied" : "Copy"}
                </button>
              </div>
            ))}
          </section>

          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: "Signed up", value: String(data.summary.signups) },
              { label: "Paying", value: String(data.summary.payingCustomers) },
              { label: "On hold (60 days)", value: money(data.summary.onHoldCents) },
              { label: "Ready to pay", value: money(data.summary.readyCents) },
              { label: "Paid to you", value: money(data.summary.paidCents) },
            ].map((t) => (
              <div key={t.label} className="border border-line p-4">
                <div className="text-xs text-muted">{t.label}</div>
                <div className="font-display mt-1 text-2xl">{t.value}</div>
              </div>
            ))}
          </section>

          <section className="mt-6 border border-line p-5">
            <h2 className="font-display text-xl">Payouts</h2>
            {data.payoutsEnabled ? (
              <>
                <p className="mt-1 text-sm text-muted">You&apos;re set. Cleared commissions go out on the 1st of each month once they add up to $25.</p>
                <button type="button" disabled={busy} className="mt-3 border border-line px-4 py-2 text-sm disabled:opacity-50" onClick={() => void stripe("GET")}>
                  Open your Stripe payout dashboard
                </button>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">
                  {data.hasPayoutAccount
                    ? "Stripe still needs a few details before it can pay you."
                    : "Stripe verifies who you are and where to send your money. It takes about five minutes."}
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  {!data.hasPayoutAccount && (
                    <label className="text-xs text-muted">
                      Where your bank is
                      <select value={country} onChange={(e) => setCountry(e.target.value)} className={input}>
                        {data.countries.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button type="button" disabled={busy} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50" onClick={() => void stripe("POST")}>
                    {data.hasPayoutAccount ? "Finish payout setup" : "Set up payouts"}
                  </button>
                </div>
                {!data.hasPayoutAccount && <p className="mt-2 text-xs text-muted">Don&apos;t see your country? Let us know through the contact page.</p>}
              </>
            )}
          </section>

          <section className="mt-6">
            <h2 className="font-display text-xl">Recent commissions</h2>
            {data.summary.recent.length === 0 ? (
              <p className="mt-2 text-sm text-muted">None yet. They appear here as soon as someone you referred pays.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
                {data.summary.recent.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span>
                      {day(r.createdAt)}
                      {r.note ? <span className="text-muted"> · {r.note}</span> : null}
                    </span>
                    <span className={r.status === "reversed" ? "text-muted line-through" : ""}>
                      {money(r.amountCents)}{" "}
                      <span className="text-xs text-muted">
                        {r.status === "paid" ? "paid" : r.status === "reversed" ? "reversed" : Date.parse(r.availableAt) > Date.now() ? `clears ${day(r.availableAt)}` : "ready"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.summary.payouts.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                Payouts: {data.summary.payouts.map((p) => `${day(p.createdAt)} ${money(p.amountCents)}${p.status === "failed" ? " (we're retrying)" : ""}`).join(" · ")}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

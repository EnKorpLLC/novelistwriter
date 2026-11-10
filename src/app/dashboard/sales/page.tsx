"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PAYOUT_MIN_CENTS, dollars } from "@/lib/direct-sale-rules";

type Summary = {
  sales: number;
  freeCopies: number;
  refunds: number;
  grossCents: number;
  feesCents: number;
  earnedCents: number;
  onHoldCents: number;
  readyCents: number;
  paidCents: number;
  byBook: { projectId: string | null; title: string; sales: number; earnedCents: number }[];
  payouts: { createdAt: string; amountCents: number; status: string }[];
};
type Seller = { tier: "pro" | "studio" | null; termsAccepted: boolean; hasAccount: boolean; payoutsEnabled: boolean; summary: Summary | null; migrationNeeded?: boolean; error?: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Direct sales across every book: totals, what's on hold, payouts, and each book's earnings. */
export default function SalesPage() {
  const [data, setData] = useState<Seller | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/sales/seller")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Could not load sales");
        setData(d);
      })
      .catch((e) => setNote(e instanceof Error ? e.message : "Could not load sales"));
  }, []);

  async function openStripe() {
    const r = await fetch("/api/sales/seller", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stripe_dashboard" }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) window.open(d.url, "_blank", "noopener");
    else setNote(d.error || "Could not open Stripe");
  }

  const s = data?.summary;
  return (
    <div className="font-ui mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/dashboard" className="text-sm text-accent hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-3 text-3xl">Sales</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Ebooks, bundles, and free copies sold straight from your launch pages. Each sale is held 14 days for refunds, then paid on the 1st of the month once
        you have {dollars(PAYOUT_MIN_CENTS)}. Turn selling on for a book in its Sell tab.
      </p>
      {note && <p className="mt-4 text-sm text-danger">{note}</p>}
      {!data && !note && <p className="mt-6 text-sm text-muted">Loading…</p>}
      {data?.migrationNeeded && <p className="mt-4 text-sm text-danger">{data.error}</p>}
      {data && !data.migrationNeeded && !data.tier && (
        <p className="mt-6 text-sm">
          Selling direct is part of Pro and Studio.{" "}
          <Link href="/billing" className="text-accent underline">
            See plans
          </Link>
        </p>
      )}

      {data?.tier && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
            {data.payoutsEnabled ? (
              <>
                <span className="text-accent">✓ Payouts set up with Stripe</span>
                <button type="button" className="border border-line px-3 py-1.5" onClick={() => void openStripe()}>
                  Bank details and payout history (Stripe)
                </button>
              </>
            ) : (
              <span className="text-muted">Payouts aren&apos;t set up yet. Start from any book&apos;s Sell tab.</span>
            )}
            <Link href="/seller-terms" className="text-muted underline">
              Seller terms
            </Link>
          </div>

          {s && (
            <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Copies sold", String(s.sales)],
                ["Readers paid", dollars(s.grossCents)],
                ["Earned after fees", dollars(s.earnedCents)],
                ["On hold", dollars(s.onHoldCents)],
                ["Ready for payout", dollars(s.readyCents)],
                ["Paid to you", dollars(s.paidCents)],
              ].map(([k, v]) => (
                <div key={k} className="border border-line px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-wide text-muted">{k}</dt>
                  <dd className="font-display text-xl">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {s && (s.freeCopies > 0 || s.refunds > 0) && (
            <p className="mt-2 text-xs text-muted">
              {s.freeCopies ? `${s.freeCopies} free ${s.freeCopies === 1 ? "copy" : "copies"} sent to readers who joined your list. ` : ""}
              {s.refunds ? `${s.refunds} refunded or disputed.` : ""}
            </p>
          )}

          <section className="mt-10">
            <h2 className="font-display text-xl">By book</h2>
            {!s?.byBook.length ? (
              <p className="mt-2 text-sm text-muted">No sales yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
                {s.byBook.map((b) => (
                  <li key={b.projectId || b.title} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    {b.projectId ? (
                      <Link href={`/project/${b.projectId}?tab=sell`} className="font-display text-base hover:text-accent">
                        {b.title}
                      </Link>
                    ) : (
                      <span className="font-display text-base">{b.title}</span>
                    )}
                    <span className="text-muted">
                      {b.sales} sold · <span className="text-ink">{dollars(b.earnedCents)}</span> earned
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="font-display text-xl">Payouts</h2>
            {!s?.payouts.length ? (
              <p className="mt-2 text-sm text-muted">No payouts yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
                {s.payouts.map((p, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span>{day(p.createdAt)}</span>
                    <span className={p.status === "paid" ? "text-ink" : "text-danger"}>
                      {dollars(p.amountCents)}
                      {p.status === "paid" ? "" : " (failed, we'll retry)"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { PAYOUT_MIN_CENTS, SALE_FEES, dollars, estimateShare, normalizeDirectSale, type DirectSale, type SellerTier } from "@/lib/direct-sale-rules";

type Seller = {
  tier: SellerTier | null;
  termsAccepted: boolean;
  hasAccount: boolean;
  payoutsEnabled: boolean;
  migrationNeeded?: boolean;
  error?: string;
  summary: { sales: number; refunds: number; earnedCents: number; onHoldCents: number; readyCents: number; paidCents: number } | null;
};

const toCents = (v: string) => Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100);
const toDollars = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));

/** Launch tab: sell this ebook straight from the launch page (Pro and Studio). */
export function DirectSalePanel({ projectId, published }: { projectId: string; published: boolean }) {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [sale, setSale] = useState<DirectSale>(normalizeDirectSale(null));
  const [price, setPrice] = useState("4.99");
  const [salePrice, setSalePrice] = useState("");
  const [status, setStatus] = useState<{ live: boolean; reason: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const back = new URLSearchParams(window.location.search).get("payouts");
    const [s, d] = await Promise.all([
      fetch(`/api/sales/seller${back ? "?refresh=1" : ""}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/projects/${projectId}/direct-sale`).then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (s) setSeller(s);
    if (d) {
      setSale(d.sale);
      setPrice(toDollars(d.sale.priceCents));
      setSalePrice(toDollars(d.sale.salePriceCents));
      setStatus({ live: d.live, reason: d.reason });
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<DirectSale>) {
    setBusy(true);
    setNote(null);
    const next = { ...sale, ...patch };
    const res = await fetch(`/api/projects/${projectId}/direct-sale`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNote(d.error || "Could not save");
    setSale(d.sale);
    setPrice(toDollars(d.sale.priceCents));
    setSalePrice(toDollars(d.sale.salePriceCents));
    setStatus({ live: d.live, reason: d.reason });
    setNote("Saved.");
  }

  async function seller_(action: "accept_terms" | "onboard") {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/sales/seller", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, returnPath: `/project/${projectId}?tab=publish` }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNote(d.error || "Something went wrong");
    if (d.url) window.location.href = d.url;
    else void load();
  }

  if (!seller) return null;
  const tier = seller.tier;
  const share = estimateShare(sale.priceCents, tier || "pro");
  const fee = SALE_FEES[tier || "pro"];

  return (
    <section className="border border-line p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">Sell the ebook direct</h3>
        {status?.live && <span className="text-xs text-accent">✓ On sale on your launch page</span>}
      </div>
      <p className="mt-1 text-muted">
        Readers buy right from your launch page, and the book goes straight into their library. You keep about{" "}
        {Math.round((share.authorCents / sale.priceCents) * 100)}% instead of a store&apos;s 70%. US readers for now; everyone else sees your store links.
      </p>
      {seller.migrationNeeded ? (
        <p className="mt-2 text-danger">{seller.error}</p>
      ) : !tier ? (
        <p className="mt-3">
          Selling direct is part of Pro (10% + 15¢ per sale) and Studio (5% + 15¢).{" "}
          <a href="/billing" className="text-accent underline">
            See plans
          </a>
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          <li className="flex gap-3">
            <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full text-center text-xs leading-5 ${seller.termsAccepted ? "bg-accent text-paper" : "border border-line"}`}>{seller.termsAccepted ? "✓" : "1"}</span>
            <div>
              <p>Seller terms</p>
              {seller.termsAccepted ? (
                <p className="text-xs text-muted">
                  Accepted.{" "}
                  <a href="/seller-terms" target="_blank" className="underline">
                    Read them again
                  </a>
                </p>
              ) : (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <a href="/seller-terms" target="_blank" className="text-accent underline">
                    Read the seller terms
                  </a>
                  <button type="button" disabled={busy} className="border border-accent px-2 py-1 text-accent" onClick={() => void seller_("accept_terms")}>
                    I agree
                  </button>
                </div>
              )}
            </div>
          </li>
          <li className="flex gap-3">
            <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full text-center text-xs leading-5 ${seller.payoutsEnabled ? "bg-accent text-paper" : "border border-line"}`}>{seller.payoutsEnabled ? "✓" : "2"}</span>
            <div>
              <p>Where your money goes</p>
              {seller.payoutsEnabled ? (
                <p className="text-xs text-muted">Payouts are set up with Stripe.</p>
              ) : (
                <>
                  <p className="text-xs text-muted">Stripe asks for your bank details and the tax info it needs. It takes a few minutes.</p>
                  <button type="button" disabled={busy || !seller.termsAccepted} className="mt-1 bg-accent px-3 py-1.5 text-xs text-paper disabled:opacity-50" onClick={() => void seller_("onboard")}>
                    {seller.hasAccount ? "Finish payout setup" : "Set up payouts with Stripe"}
                  </button>
                </>
              )}
            </div>
          </li>
          <li className="flex gap-3">
            <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full text-center text-xs leading-5 ${status?.live ? "bg-accent text-paper" : "border border-line"}`}>{status?.live ? "✓" : "3"}</span>
            <div className="min-w-0 flex-1">
              <p>Price</p>
              <div className="mt-1 flex flex-wrap items-end gap-3 text-xs">
                <label>
                  Price (USD)
                  <input value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => void save({ priceCents: toCents(price) })} inputMode="decimal" className="mt-1 block w-24 border border-line bg-paper px-2 py-1.5 text-sm" />
                </label>
                <label>
                  Sale price (optional)
                  <input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} onBlur={() => void save({ salePriceCents: salePrice.trim() ? toCents(salePrice) : null })} inputMode="decimal" placeholder="e.g. 0.99" className="mt-1 block w-24 border border-line bg-paper px-2 py-1.5 text-sm" />
                </label>
                {sale.salePriceCents != null && (
                  <>
                    <label>
                      Sale starts
                      <input type="date" value={sale.saleStarts || ""} onChange={(e) => void save({ saleStarts: e.target.value || null })} className="mt-1 block border border-line bg-paper px-2 py-1 text-sm" />
                    </label>
                    <label>
                      Sale ends
                      <input type="date" value={sale.saleEnds || ""} onChange={(e) => void save({ saleEnds: e.target.value || null })} className="mt-1 block border border-line bg-paper px-2 py-1 text-sm" />
                    </label>
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">
                At {dollars(sale.priceCents)} you keep about <strong className="text-ink">{dollars(share.authorCents)}</strong> per sale: Stripe takes about {dollars(share.stripeCents)} and our fee is{" "}
                {dollars(share.feeCents)} ({Math.round(fee.pct * 100)}% + {fee.fixedCents}¢). Sales tax is added on top at checkout.
              </p>
              {share.authorCents / sale.priceCents < 0.65 && (
                <p className="mt-1 text-xs text-muted">At low prices the fixed per-sale fees take a bigger bite. From $2.99 up you keep most of each sale.</p>
              )}
              <label className="mt-3 flex items-center gap-2">
                <input type="checkbox" checked={sale.on} disabled={busy} onChange={(e) => void save({ on: e.target.checked })} />
                Sell this book on my launch page
              </label>
              {sale.on && !status?.live && status?.reason && <p className="mt-1 text-xs text-danger">Not on sale yet: {status.reason}</p>}
              {!published && <p className="mt-1 text-xs text-muted">Selling starts once the book is marked out now.</p>}
            </div>
          </li>
        </ol>
      )}
      {note && <p className={`mt-3 text-xs ${note === "Saved." ? "text-accent" : "text-danger"}`}>{note}</p>}
      {seller.summary && seller.summary.sales + seller.summary.refunds > 0 && (
        <div className="mt-5 border-t border-line pt-3">
          <p className="text-ink">Your direct sales (all books)</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              ["Copies sold", String(seller.summary.sales)],
              ["Earned after fees", dollars(seller.summary.earnedCents)],
              ["On hold (refund window)", dollars(seller.summary.onHoldCents)],
              ["Ready for payout", dollars(seller.summary.readyCents)],
            ].map(([k, v]) => (
              <div key={k} className="border border-line px-2 py-1.5">
                <dt className="text-muted">{k}</dt>
                <dd className="font-display text-lg">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">
            Payouts go out on the 1st of each month once {dollars(PAYOUT_MIN_CENTS)} is ready. {dollars(seller.summary.paidCents)} paid so far
            {seller.summary.refunds ? `; ${seller.summary.refunds} refunded` : ""}.
          </p>
        </div>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { PAYOUT_MIN_CENTS, SALE_FEES, dollars, estimateShare, normalizeDirectSale, type DirectSale, type DiscountCode, type SellerTier } from "@/lib/direct-sale-rules";

type Seller = {
  tier: SellerTier | null;
  termsAccepted: boolean;
  hasAccount: boolean;
  payoutsEnabled: boolean;
  migrationNeeded?: boolean;
  error?: string;
  summary: { sales: number; freeCopies: number; refunds: number; earnedCents: number; onHoldCents: number; readyCents: number; paidCents: number } | null;
};

/** Codes work across the author's books unless limited to one; shared as a link that fills in the code. */
function DiscountCodes({ projectId, launchPath }: { projectId: string; launchPath: string | null }) {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [form, setForm] = useState({ code: "", kind: "percent", value: "25", thisBook: true, maxUses: "", endsOn: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/sales/codes").catch(() => null);
    if (r?.ok) setCodes((await r.json()).codes || []);
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  async function send(method: string, body: unknown) {
    const r = await fetch("/api/sales/codes", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? null : d.error || "Something went wrong");
    await load();
    return r.ok;
  }

  const forThis = codes.filter((c) => !c.projectIds.length || c.projectIds.includes(projectId));
  return (
    <div className="mt-5 border-t border-line pt-3">
      <p className="text-ink">Discount codes</p>
      <p className="text-xs text-muted">For launch day, your newsletter, or a promo. A code can&apos;t take the price below $0.99.</p>
      <form
        className="mt-2 flex flex-wrap items-end gap-2 text-xs"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await send("POST", {
            code: form.code,
            ...(form.kind === "percent" ? { percentOff: Number(form.value) } : { amountOffCents: Math.round(Number(form.value) * 100) }),
            projectIds: form.thisBook ? [projectId] : [],
            maxUses: form.maxUses ? Number(form.maxUses) : undefined,
            endsOn: form.endsOn || undefined,
          });
          if (ok) setForm((f) => ({ ...f, code: "" }));
        }}
      >
        <label>
          Code
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="LAUNCH25" className="mt-1 block w-28 border border-line bg-paper px-2 py-1 uppercase" />
        </label>
        <label>
          Off
          <span className="mt-1 flex">
            <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} inputMode="decimal" className="w-14 border border-line bg-paper px-2 py-1" />
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="border border-l-0 border-line bg-paper px-1">
              <option value="percent">%</option>
              <option value="amount">$</option>
            </select>
          </span>
        </label>
        <label>
          Max uses
          <input value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} inputMode="numeric" placeholder="Any" className="mt-1 block w-16 border border-line bg-paper px-2 py-1" />
        </label>
        <label>
          Ends
          <input type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} className="mt-1 block border border-line bg-paper px-1 py-0.5" />
        </label>
        <label className="flex items-center gap-1 pb-1">
          <input type="checkbox" checked={form.thisBook} onChange={(e) => setForm({ ...form, thisBook: e.target.checked })} /> This book only
        </label>
        <button type="submit" className="bg-accent px-3 py-1.5 text-paper">
          Add code
        </button>
      </form>
      {msg && <p className="mt-1 text-xs text-danger">{msg}</p>}
      {forThis.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs">
          {forThis.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <strong className={`font-mono ${c.active ? "" : "text-muted line-through"}`}>{c.code}</strong>
              <span className="text-muted">
                {c.percentOff ? `${c.percentOff}% off` : `${dollars(c.amountOffCents || 0)} off`} · {c.projectIds.length ? "this book" : "all your books"} · used {c.uses}
                {c.maxUses ? ` of ${c.maxUses}` : ""}
                {c.endsOn ? ` · ends ${c.endsOn}` : ""}
              </span>
              {launchPath && origin && c.active && (
                <button type="button" className="text-accent underline" onClick={() => void navigator.clipboard.writeText(`${origin}${launchPath}?code=${c.code}`).then(() => setMsg(null))}>
                  Copy link
                </button>
              )}
              <button type="button" className="text-muted underline" onClick={() => void send("PATCH", { id: c.id, active: !c.active })}>
                {c.active ? "Turn off" : "Turn on"}
              </button>
              <button type="button" className="text-danger underline" onClick={() => void send("DELETE", { id: c.id })}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const toCents = (v: string) => Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100);
const toDollars = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));

/** Launch tab: sell this ebook straight from the launch page (Pro and Studio). */
export function DirectSalePanel({ projectId, published, launchPath }: { projectId: string; published: boolean; launchPath: string | null }) {
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
      {tier && !seller.migrationNeeded && (
        <div className="mt-5 border-t border-line pt-3">
          <p className="text-ink">Free for joining your list (reader magnet)</p>
          {tier === "studio" ? (
            <>
              <label className="mt-1 flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5" checked={sale.magnet} disabled={busy} onChange={(e) => void save({ magnet: e.target.checked })} />
                <span>
                  Give this book free to readers who join your email list
                  <span className="block text-muted">
                    They confirm their email, then get the ebook in their library. Great for a prequel, novella, or book one. Works before release too, and
                    for readers anywhere. No fees.
                  </span>
                </span>
              </label>
              {sale.magnet && sale.on && <p className="mt-1 text-xs text-muted">This book is also for sale, so the launch page shows both: buy it, or get it free by joining.</p>}
            </>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Reader magnets come with your email list on Studio.{" "}
              <a href="/billing" className="text-accent underline">
                See Studio
              </a>
            </p>
          )}
        </div>
      )}
      {tier && !seller.migrationNeeded && <DiscountCodes projectId={projectId} launchPath={launchPath} />}
      {note && <p className={`mt-3 text-xs ${note === "Saved." ? "text-accent" : "text-danger"}`}>{note}</p>}
      {seller.summary && seller.summary.sales + seller.summary.refunds + seller.summary.freeCopies > 0 && (
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
            {seller.summary.refunds ? `; ${seller.summary.refunds} refunded` : ""}
            {seller.summary.freeCopies ? `. ${seller.summary.freeCopies} free ${seller.summary.freeCopies === 1 ? "copy" : "copies"} sent to readers who joined your list` : ""}.
          </p>
        </div>
      )}
    </section>
  );
}

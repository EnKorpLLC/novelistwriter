"use client";

import { useState } from "react";
import { dollars } from "@/lib/direct-sale-rules";
import { PRINT_DAYS, US_STATES } from "@/lib/print-rules";

type Level = { id: string; label: string; note: string; cents: number };

/** "Buy the paperback": state and ZIP code for shipping prices, a shipping choice, then Stripe Checkout. Also the author's proof order. */
export function BuyPaperbackButton({
  projectId,
  priceCents,
  freeEbook,
  canBuy = true,
  proof = false,
  quiet = false,
}: {
  projectId: string;
  priceCents: number;
  freeEbook?: boolean;
  canBuy?: boolean;
  proof?: boolean;
  quiet?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [level, setLevel] = useState("MAIL");
  const [price, setPrice] = useState(priceCents);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canBuy) return proof ? null : <p className="font-ui w-full text-xs text-muted">Paperbacks ship to US addresses for now. The store links below work everywhere.</p>;

  async function quote() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/sales/paperback-quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, state, zip, proof }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setError(d.error || "Shipping prices didn't load. Try again.");
    setLevels(d.levels);
    if (d.priceCents) setPrice(d.priceCents);
    setLevel(d.levels[0]?.id || "MAIL");
  }

  async function checkout() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/sales/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, format: "paperback", state, zip, shippingLevel: level, proof }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && d.url) window.location.href = d.url;
    else {
      setError(d.error || "Checkout didn't start. Try again.");
      setBusy(false);
    }
  }

  const ship = levels?.find((l) => l.id === level);
  return (
    <span className="font-ui inline-flex w-full max-w-md flex-col text-left sm:w-auto">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={quiet || proof ? "border border-ink px-4 py-2 text-sm text-ink" : "bg-ink px-4 py-2 text-sm text-paper"}>
          {proof ? "Order a proof copy" : "Buy the paperback"} {proof ? "" : dollars(priceCents)}
        </button>
      ) : (
        <span className="space-y-2 border border-line p-3 text-sm">
          <span className="block text-ink">{proof ? "Your proof copy, at cost" : `Paperback, ${dollars(priceCents)} plus shipping`}</span>
          <span className="flex flex-wrap gap-2">
            <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State" className="border border-line bg-paper px-2 py-1.5">
              <option value="">State</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="ZIP code" aria-label="ZIP code" className="w-24 border border-line bg-paper px-2 py-1.5" />
            <button type="button" disabled={busy || !state || zip.length !== 5} onClick={() => void quote()} className="border border-line px-3 py-1.5 disabled:opacity-50">
              {busy && !levels ? "Checking…" : "Shipping prices"}
            </button>
          </span>
          {levels && (
            <>
              <span className="block space-y-1">
                {levels.map((l) => (
                  <label key={l.id} className="flex items-start gap-2">
                    <input type="radio" className="mt-1" checked={level === l.id} onChange={() => setLevel(l.id)} />
                    <span>
                      {l.label} {dollars(l.cents)}
                      <span className="block text-[11px] text-muted">{l.note}</span>
                    </span>
                  </label>
                ))}
              </span>
              <button type="button" disabled={busy} onClick={() => void checkout()} className="w-full bg-ink px-4 py-2 text-paper disabled:opacity-60">
                {busy ? "Opening checkout…" : `Checkout: ${dollars(price + (ship?.cents || 0))} plus any tax`}
              </button>
            </>
          )}
          <span className="block text-[11px] text-muted">
            Printed on demand in {PRINT_DAYS}, then shipped. {proof ? "" : "Cancel within an hour of ordering. "}
            {freeEbook && !proof ? "The ebook comes free, right away." : ""}
          </span>
        </span>
      )}
      {error && <span className="mt-1 text-xs text-danger">{error}</span>}
    </span>
  );
}

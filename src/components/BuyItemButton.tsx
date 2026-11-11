"use client";

import { useState } from "react";
import { dollars } from "@/lib/direct-sale-rules";
import { MAX_QUANTITY, PERSONALIZE_MAX } from "@/lib/shop-rules";

/** One item from the author's shop: quantity, an optional dedication, then Stripe Checkout (US addresses). */
export function BuyItemButton({ itemId, priceCents, stock, personalize, canBuy }: { itemId: string; priceCents: number; stock: number; personalize: boolean; canBuy: boolean }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [dedication, setDedication] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canBuy) return <span className="font-ui text-[11px] text-muted">Ships to US addresses only</span>;
  if (stock < 1) return <span className="font-ui text-xs text-muted">Sold out</span>;
  if (!open) {
    return (
      <button type="button" className="font-ui border border-ink px-3 py-1.5 text-xs text-ink" onClick={() => setOpen(true)}>
        Buy {dollars(priceCents)}
      </button>
    );
  }
  return (
    <span className="font-ui flex flex-col gap-2 text-xs">
      <span className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          How many
          <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className="border border-line bg-paper px-1 py-1">
            {Array.from({ length: Math.min(MAX_QUANTITY, stock) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {stock <= 5 && <span className="text-muted">Only {stock} left</span>}
      </span>
      {personalize && (
        <input value={dedication} onChange={(e) => setDedication(e.target.value.slice(0, PERSONALIZE_MAX))} placeholder="Dedication, like “To Sam” (optional)" className="border border-line bg-paper px-2 py-1" />
      )}
      <button
        type="button"
        disabled={busy}
        className="bg-ink px-3 py-1.5 text-paper disabled:opacity-60"
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await fetch("/api/sales/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format: "item", itemId, quantity: qty, personalization: dedication }) }).catch(() => null);
          const d = r ? await r.json().catch(() => ({})) : {};
          if (r?.ok && d.url) window.location.href = d.url;
          else {
            setError(d.error || "Checkout didn't start. Try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening checkout…" : `Checkout: ${dollars(priceCents * qty)} plus shipping`}
      </button>
      {error && <span className="text-danger">{error}</span>}
    </span>
  );
}

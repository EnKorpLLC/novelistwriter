"use client";

import { useState } from "react";
import { dollars } from "@/lib/direct-sale-rules";

/** "Buy the ebook" on a launch page: Stripe Checkout, then the book lands in the reader's library. */
export function BuyDirectButton({ projectId, price, canBuy }: { projectId: string; price: { cents: number; regularCents: number | null }; canBuy: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canBuy) {
    return <p className="font-ui w-full text-xs text-muted">Buying the ebook here is open to US readers for now. The store links below work everywhere.</p>;
  }
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch("/api/sales/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }) }).catch(() => null);
          const d = res ? await res.json().catch(() => ({})) : {};
          if (res?.ok && d.url) window.location.href = d.url;
          else {
            setError(d.error || "Checkout didn't start. Try again.");
            setBusy(false);
          }
        }}
        className="bg-ink px-4 py-2 text-sm text-paper disabled:opacity-60"
        title="Pay once, keep it forever, read on any e-reader"
      >
        {busy ? "Opening checkout…" : "Buy the ebook"}{" "}
        {price.regularCents != null && <s className="opacity-60">{dollars(price.regularCents)}</s>} {dollars(price.cents)}
      </button>
      <span className="font-ui mt-1 text-[11px] text-muted">Direct from the author · EPUB for any e-reader</span>
      {error && <span className="font-ui mt-1 text-xs text-danger">{error}</span>}
    </span>
  );
}

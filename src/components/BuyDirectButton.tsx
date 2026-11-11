"use client";

import { useEffect, useState } from "react";
import { dollars } from "@/lib/direct-sale-rules";

/** "Buy the ebook" (or the audiobook, or both) on a launch page: Stripe Checkout, then the book lands in the reader's library. */
export function BuyDirectButton({
  projectId,
  price,
  canBuy,
  format = "ebook",
  extraId,
  label,
  note,
  quiet = false,
}: {
  projectId: string;
  price: { cents: number; regularCents: number | null };
  canBuy: boolean;
  format?: "ebook" | "audiobook" | "both" | "extra";
  /** With format "extra": which extra */
  extraId?: string;
  label?: string;
  note?: string;
  /** A secondary button next to the main one */
  quiet?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);

  // Authors share links like …?code=LAUNCH25
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    if (fromUrl) {
      setCode(fromUrl.toUpperCase());
      setShowCode(true);
    }
  }, []);

  if (!canBuy) {
    if (format !== "ebook") return null;
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
          const res = await fetch("/api/sales/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, format, extraId, code: format === "extra" ? undefined : code.trim() || undefined }),
          }).catch(() => null);
          const d = res ? await res.json().catch(() => ({})) : {};
          if (res?.ok && d.url) window.location.href = d.url;
          else {
            setError(d.error || "Checkout didn't start. Try again.");
            setBusy(false);
          }
        }}
        className={quiet ? "border border-ink px-4 py-2 text-sm text-ink disabled:opacity-60" : "bg-ink px-4 py-2 text-sm text-paper disabled:opacity-60"}
        title={format === "ebook" ? "Pay once, keep it forever, read on any e-reader" : "Pay once, keep it forever, listen anywhere"}
      >
        {busy ? "Opening checkout…" : label || "Buy the ebook"}{" "}
        {price.regularCents != null && <s className="opacity-60">{dollars(price.regularCents)}</s>} {dollars(price.cents)}
      </button>
      <span className="font-ui mt-1 text-[11px] text-muted">
        {note || "Direct from the author · EPUB for any e-reader"}
        {format === "extra" ? null : " · "}
        {format === "extra" ? null : showCode ? (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Discount code"
            aria-label="Discount code"
            className="ml-1 w-28 border border-line bg-paper px-1 py-0.5 text-[11px] uppercase text-ink"
          />
        ) : (
          <button type="button" className="underline" onClick={() => setShowCode(true)}>
            Have a code?
          </button>
        )}
      </span>
      {error && <span className="font-ui mt-1 text-xs text-danger">{error}</span>}
    </span>
  );
}

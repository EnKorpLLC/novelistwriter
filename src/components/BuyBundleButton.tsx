"use client";

import { useState } from "react";
import { dollars } from "@/lib/direct-sale-rules";

/** "Get all 3 books" on a launch page: one checkout, each book as its own ebook, or a box set as one ebook. */
export function BuyBundleButton({
  bundle,
  fromProjectId,
}: {
  bundle: { id: string; title: string; count: number; priceCents: number; savingsCents: number; oneFile?: boolean };
  fromProjectId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
            body: JSON.stringify({ bundleId: bundle.id, fromProjectId }),
          }).catch(() => null);
          const d = res ? await res.json().catch(() => ({})) : {};
          if (res?.ok && d.url) window.location.href = d.url;
          else {
            setError(d.error || "Checkout didn't start. Try again.");
            setBusy(false);
          }
        }}
        className="border border-ink px-4 py-2 text-sm text-ink hover:bg-ink/5 disabled:opacity-60"
      >
        {busy ? "Opening checkout…" : `Get ${bundle.title}: all ${bundle.count} books`} {dollars(bundle.priceCents)}
      </button>
      <span className="font-ui mt-1 text-[11px] text-muted">
        {bundle.savingsCents > 0 ? `Save ${dollars(bundle.savingsCents)} · ` : ""}
        {bundle.oneFile ? `All ${bundle.count} books in one ebook` : "Each book as its own ebook"}
      </span>
      {error && <span className="font-ui mt-1 text-xs text-danger">{error}</span>}
    </span>
  );
}

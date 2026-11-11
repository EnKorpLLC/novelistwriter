"use client";

import { useState } from "react";

/** Within the hour after ordering, before Lulu starts printing: cancel for a full refund. */
export function PaperbackCancel({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="font-ui mt-3 inline-flex flex-col text-sm">
      <button
        type="button"
        disabled={busy}
        className="border border-line px-4 py-2 disabled:opacity-60"
        onClick={async () => {
          if (!window.confirm("Cancel this order? You'll get a full refund.")) return;
          setBusy(true);
          setMsg(null);
          const r = await fetch("/api/sales/paperback-cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
          const d = r ? await r.json().catch(() => ({})) : {};
          if (r?.ok) window.location.reload();
          else {
            setMsg(d.error || "Couldn't cancel. Try again.");
            setBusy(false);
          }
        }}
      >
        Cancel my order
      </button>
      {msg && <span className="mt-1 text-xs text-danger">{msg}</span>}
    </span>
  );
}

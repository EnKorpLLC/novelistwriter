"use client";

import { useState } from "react";

/** On a waiting pre-order's page: cancel for a full refund, or keep it after the author moves the date. */
export function PreorderActions({ token, moved, newDateLabel }: { token: string; moved: boolean; newDateLabel: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(action: "cancel" | "keep") {
    if (action === "cancel" && !window.confirm("Cancel your pre-order? You'll get a full refund.")) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/sales/preorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) window.location.reload();
    else {
      setMsg(d.error || "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="font-ui mt-4 flex flex-wrap items-center gap-3 text-sm">
      {moved && (
        <button type="button" disabled={busy} onClick={() => void send("keep")} className="bg-accent px-4 py-2 text-paper disabled:opacity-60">
          Keep it for {newDateLabel || "the new date"}
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => void send("cancel")} className="border border-line px-4 py-2 text-ink disabled:opacity-60">
        Cancel my pre-order
      </button>
      {msg && <span className="w-full text-xs text-danger">{msg}</span>}
    </div>
  );
}

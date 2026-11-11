"use client";

import { useState } from "react";

const REASONS = [
  "The work isn't human-made (AI was used)",
  "Didn't deliver, or stopped answering",
  "Rude, threatening, or abusive",
  "Asked to pay outside Novelist Writer",
  "Copied someone else's work",
  "Something else",
];

/** Report a pro or an author from the marketplace, privately, to Novelist Writer. */
export function ReportPerson({ userId, label, context }: { userId: string; label: string; context: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") return <p className="font-ui text-xs text-muted">Thanks. Only Novelist Writer sees reports, and we&apos;ll look at it.</p>;
  if (!open) {
    return (
      <button type="button" className="font-ui text-xs text-muted underline" onClick={() => setOpen(true)}>
        Report {label}
      </button>
    );
  }
  return (
    <form
      className="font-ui space-y-2 border border-line p-3 text-xs"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        const r = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "conduct", targetUserId: userId, reason: `Marketplace: ${reason}`, details: `${context}\n\n${details}`.trim() }),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => ({})) : {};
        if (r?.ok) setState("done");
        else {
          setError(d.error || "That didn't send. Try again.");
          setState("idle");
        }
      }}
    >
      <p className="text-ink">Report {label}</p>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-line bg-paper px-2 py-1">
        {REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="What happened (optional)" className="block w-full border border-line bg-paper px-2 py-1" />
      <div className="flex gap-3">
        <button type="submit" disabled={state === "busy"} className="bg-accent px-3 py-1 text-paper disabled:opacity-50">
          Send report
        </button>
        <button type="button" className="text-muted underline" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p className="text-danger">{error}</p>}
    </form>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type Affiliate = {
  userId: string;
  name: string;
  email: string | null;
  handle: string | null;
  status: "applied" | "approved" | "rejected" | "suspended";
  website: string;
  audience: string;
  appliedAt: string;
  adminNote: string;
  payoutsEnabled: boolean;
  hasPayoutAccount: boolean;
  summary: { signups: number; payingCustomers: number; onHoldCents: number; readyCents: number; paidCents: number } | null;
};
type Payout = { affiliate_user_id: string; name: string; amount_cents: number; status: string; error: string | null; created_at: string };

const money = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;

/** Affiliate applications, what approved affiliates are owed, and payouts. */
export function AdminAffiliates({ onNote }: { onNote: (msg: string | null) => void }) {
  const [rows, setRows] = useState<Affiliate[] | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/affiliates");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onNote(data.error || "Could not load affiliates");
      setRows([]);
      return;
    }
    setRows(data.affiliates || []);
    setPayouts(data.payouts || []);
  }, [onNote]);
  useEffect(() => {
    void load();
  }, [load]);

  async function decide(a: Affiliate, status: "approved" | "rejected" | "suspended") {
    const res = await fetch("/api/admin/affiliates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: a.userId, status, note: notes[a.userId] || "" }) });
    const data = await res.json().catch(() => ({}));
    onNote(res.ok ? `${a.name}: ${status}.` : data.error || "Could not update");
    await load();
  }

  async function payNow() {
    if (!window.confirm("Send payouts now to every affiliate owed $25 or more in cleared commissions?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/affiliates", { method: "POST" });
      const r = await res.json().catch(() => ({}));
      onNote(res.ok ? `Paid ${r.paid} affiliates ${money(r.paidCents || 0)}. ${r.failed ? `${r.failed} failed: ${r.errors?.[0] || ""}` : ""}` : r.error || "Payout run failed");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!rows) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  const applied = rows.filter((r) => r.status === "applied");
  const approved = rows.filter((r) => r.status === "approved");
  const other = rows.filter((r) => r.status === "rejected" || r.status === "suspended");
  const owed = approved.reduce((n, a) => n + (a.summary?.readyCents || 0), 0);
  const held = approved.reduce((n, a) => n + (a.summary?.onHoldCents || 0), 0);
  const failed = payouts.filter((p) => p.status === "failed");

  return (
    <div className="mt-6 space-y-8 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          30% of subscription payments for 12 months, held 60 days, paid on the 1st through Stripe Connect. Ready now: {money(owed)} · on hold: {money(held)}.
        </p>
        <button type="button" disabled={busy} onClick={() => void payNow()} className="bg-accent px-4 py-2 text-paper disabled:opacity-50">
          Pay now
        </button>
      </div>
      {failed.length > 0 && (
        <p className="border border-danger/40 p-3 text-danger">
          {failed.length} recent payout{failed.length === 1 ? "" : "s"} failed. Latest: {failed[0].error}. If it says the balance is too low, add funds in Stripe
          (Balance → Add funds) and press Pay now.
        </p>
      )}

      <section>
        <h3 className="font-display text-lg">Applications ({applied.length})</h3>
        {applied.length === 0 && <p className="mt-2 text-muted">None waiting.</p>}
        <ul className="mt-2 space-y-3">
          {applied.map((a) => (
            <li key={a.userId} className="border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink">
                  {a.name} <span className="text-muted">{a.email}</span>
                </span>
                <span className="text-xs text-muted">applied {new Date(a.appliedAt).toLocaleDateString()}</span>
              </div>
              {a.website && (
                <a href={a.website} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-accent underline">
                  {a.website}
                </a>
              )}
              <p className="mt-2 whitespace-pre-wrap text-muted">{a.audience}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input value={notes[a.userId] || ""} onChange={(e) => setNotes((n) => ({ ...n, [a.userId]: e.target.value }))} placeholder="Note (sent if you decline)" className="min-w-60 flex-1 border border-line bg-paper px-2 py-1.5" />
                <button type="button" className="bg-accent px-3 py-1.5 text-paper" onClick={() => void decide(a, "approved")}>
                  Approve
                </button>
                <button type="button" className="text-muted underline" onClick={() => void decide(a, "rejected")}>
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-lg">Affiliates ({approved.length})</h3>
        {approved.length === 0 ? (
          <p className="mt-2 text-muted">No approved affiliates yet.</p>
        ) : (
          <table className="mt-2 w-full">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-1.5 font-normal">Affiliate</th>
                <th className="py-1.5 text-right font-normal">Signups</th>
                <th className="py-1.5 text-right font-normal">Paying</th>
                <th className="py-1.5 text-right font-normal">On hold</th>
                <th className="py-1.5 text-right font-normal">Ready</th>
                <th className="py-1.5 text-right font-normal">Paid</th>
                <th className="py-1.5 text-right font-normal">Payouts</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {approved.map((a) => (
                <tr key={a.userId} className="border-b border-line/60">
                  <td className="py-1.5">
                    {a.name} <span className="text-xs text-muted">{a.email}</span>
                  </td>
                  <td className="py-1.5 text-right">{a.summary?.signups ?? 0}</td>
                  <td className="py-1.5 text-right">{a.summary?.payingCustomers ?? 0}</td>
                  <td className="py-1.5 text-right">{money(a.summary?.onHoldCents ?? 0)}</td>
                  <td className="py-1.5 text-right">{money(a.summary?.readyCents ?? 0)}</td>
                  <td className="py-1.5 text-right">{money(a.summary?.paidCents ?? 0)}</td>
                  <td className="py-1.5 text-right text-xs">{a.payoutsEnabled ? "Ready" : a.hasPayoutAccount ? "Unfinished" : "Not set up"}</td>
                  <td className="py-1.5 text-right">
                    <button type="button" className="text-xs text-danger underline" onClick={() => window.confirm(`Pause ${a.name}? New commissions stop.`) && void decide(a, "suspended")}>
                      Pause
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {other.length > 0 && (
        <section>
          <h3 className="font-display text-lg">Declined and paused</h3>
          <ul className="mt-2 space-y-1">
            {other.map((a) => (
              <li key={a.userId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {a.name} <span className="text-muted">· {a.status}{a.adminNote ? ` · ${a.adminNote}` : ""}</span>
                </span>
                <button type="button" className="text-xs text-accent underline" onClick={() => void decide(a, "approved")}>
                  Approve
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {payouts.length > 0 && (
        <section>
          <h3 className="font-display text-lg">Recent payouts</h3>
          <ul className="mt-2 space-y-1">
            {payouts.map((p, i) => (
              <li key={i} className={p.status === "failed" ? "text-danger" : ""}>
                {new Date(p.created_at).toLocaleDateString()} · {p.name} · {money(p.amount_cents)} · {p.status}
                {p.error ? ` · ${p.error}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

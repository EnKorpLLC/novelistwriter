"use client";

import { useState } from "react";

/** Gift Studio days (never AI credits) to one account or every author account. */
export function GiftForm({
  target,
  onDone,
}: {
  target: { userId: string; label: string } | "all";
  onDone: (message: string) => void;
}) {
  const [days, setDays] = useState(7);
  const [startNow, setStartNow] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const everyone = target === "all";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const who = everyone ? "every author account" : target.label;
    if (!window.confirm(`Gift ${days} Studio day${days === 1 ? "" : "s"} to ${who}${startNow ? ", starting now" : ""}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(everyone ? { all: true } : { userId: target.userId }),
          days,
          startNow,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gift failed");
      onDone(
        everyone
          ? `Gifted ${days} day${days === 1 ? "" : "s"} to ${data.gifted} of ${data.total} author accounts.`
          : `Gifted ${days} day${days === 1 ? "" : "s"} to ${target.label}${data.emailed ? " and emailed them" : ""}.`
      );
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gift failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          Days
          <input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
            className="mt-1 block w-24 border border-line bg-paper px-2 py-1.5"
          />
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} />
          Start right away (otherwise it goes to their bank)
        </label>
      </div>
      <label className="block">
        Message they&apos;ll see (optional)
        <input
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Thanks for being one of our first writers!"
          className="mt-1 block w-full border border-line bg-paper px-2 py-1.5"
        />
      </label>
      {error && <p className="text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-paper disabled:opacity-60">
        {busy ? "Gifting…" : everyone ? "Gift to every author" : "Gift days"}
      </button>
    </form>
  );
}

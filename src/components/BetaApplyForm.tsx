"use client";

import { useState } from "react";

export function BetaApplyForm({ projectId }: { projectId: string }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/beta/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, email }),
      });
      const data = await res.json();
      setMsg(data.message || data.error || (res.ok ? "Request sent." : "Could not send request."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="font-ui mt-8 space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={busy}
        className="bg-accent px-4 py-2 text-paper disabled:opacity-50"
      >
        {busy ? "Sending…" : "Request to beta read"}
      </button>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </form>
  );
}

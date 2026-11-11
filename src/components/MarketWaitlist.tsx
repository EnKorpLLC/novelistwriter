"use client";

import { useState } from "react";

/** "Tell me when it opens" for one type of pro. Signed-in authors don't need to type their email. */
export function MarketWaitlist({ type, label, signedIn }: { type: string; label: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setState("busy");
    setError(null);
    const r = await fetch("/api/market/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ types: [type], email: email || undefined, company }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) setState("done");
    else {
      setError(d.error || "That didn't go through. Try again.");
      setState("idle");
    }
  }

  if (state === "done") return <p className="font-ui text-xs text-accent">✓ We&apos;ll email you when {label.toLowerCase()} open.</p>;
  if (!open && !signedIn) {
    return (
      <button type="button" className="font-ui border border-accent px-3 py-1.5 text-xs text-accent" onClick={() => setOpen(true)}>
        Tell me when it opens
      </button>
    );
  }
  return (
    <form
      className="font-ui flex flex-wrap items-center gap-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        void join();
      }}
    >
      {!signedIn && (
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Your email"
          className="w-48 border border-line bg-paper px-2 py-1.5"
        />
      )}
      <input value={company} onChange={(e) => setCompany(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <button type="submit" disabled={state === "busy"} className="border border-accent px-3 py-1.5 text-accent disabled:opacity-60">
        {state === "busy" ? "Saving…" : "Tell me when it opens"}
      </button>
      {error && <span className="w-full text-danger">{error}</span>}
    </form>
  );
}

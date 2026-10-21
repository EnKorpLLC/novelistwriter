"use client";

import { useState } from "react";

const MESSAGES: Record<string, string> = {
  subscribed: "You're on the list.",
  already: "You're already on the list.",
  check_email: "Almost there. Check your email (and spam folder) for a confirmation link.",
};

/** Email signup for an author's list; works for guests (confirm by email) and signed-in readers. */
export function GuestListSignup({
  authorUserId,
  authorName,
  heading,
}: {
  authorUserId: string;
  authorName: string;
  heading?: string;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/audience/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorUserId, email, name, company }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not sign up");
      setMessage(MESSAGES[data.status] || "Thanks!");
      setDone(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not sign up");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="font-ui border border-line p-4">
      <p className="font-display text-lg">{heading || `Get updates from ${authorName}`}</p>
      <p className="mt-1 text-xs text-muted">
        New books, advance copies, and release news. Unsubscribe anytime.
      </p>
      {!done && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name (optional)"
            className="w-40 border border-line bg-paper px-3 py-2 text-sm"
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="min-w-[12rem] flex-1 border border-line bg-paper px-3 py-2 text-sm"
          />
          <input
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-60">
            {busy ? "Joining…" : "Join"}
          </button>
        </div>
      )}
      {message && <p className="mt-2 text-sm text-ink">{message}</p>}
    </form>
  );
}

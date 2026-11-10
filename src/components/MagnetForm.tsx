"use client";

import { useState } from "react";
import { readVisitSource } from "@/lib/first-touch";

/** Reader magnet on a launch page: join the author's list and get the book free. */
export function MagnetForm({ projectId, title, authorName }: { projectId: string; title: string; authorName: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [state, setState] = useState<{ status: "idle" | "busy" | "check_email" | "delivered"; url?: string; error?: string }>({ status: "idle" });

  if (state.status === "check_email") {
    return (
      <div className="font-ui border border-accent p-4 text-sm">
        <p className="text-ink">Check your email.</p>
        <p className="mt-1 text-muted">Confirm you want to join {authorName}&apos;s list and your free copy of {title} is sent right away.</p>
      </div>
    );
  }
  if (state.status === "delivered" && state.url) {
    return (
      <div className="font-ui border border-accent p-4 text-sm">
        <p className="text-ink">It&apos;s yours. We&apos;ve emailed the link too.</p>
        <a href={state.url} className="mt-2 inline-block bg-accent px-4 py-2 text-paper">
          Get your ebook
        </a>
      </div>
    );
  }
  return (
    <form
      className="font-ui border border-line p-4 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ status: "busy" });
        const res = await fetch("/api/sales/magnet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, email, name, company, cameFrom: readVisitSource() }),
        }).catch(() => null);
        const d = res ? await res.json().catch(() => ({})) : {};
        if (!res?.ok) return setState({ status: "idle", error: d.error || "Something went wrong. Try again." });
        setState({ status: d.status === "delivered" ? "delivered" : "check_email", url: d.downloadUrl });
      }}
    >
      <p className="font-display text-lg">Get {title} free</p>
      <p className="mt-1 text-muted">Join {authorName}&apos;s list for new books and release news, and the ebook is yours. Unsubscribe anytime.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name (optional)" className="w-40 border border-line bg-paper px-2 py-1.5" />
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="min-w-48 flex-1 border border-line bg-paper px-2 py-1.5" />
        <input value={company} onChange={(e) => setCompany(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <button type="submit" disabled={state.status === "busy"} className="bg-accent px-4 py-1.5 text-paper disabled:opacity-60">
          {state.status === "busy" ? "Sending…" : "Send me the book"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
    </form>
  );
}

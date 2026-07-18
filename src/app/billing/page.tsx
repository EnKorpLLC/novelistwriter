"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function BillingInner() {
  const search = useSearchParams();
  const unlock = search.get("unlock");
  const success = search.get("success");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(body: Record<string, unknown>) {
    setLoading(JSON.stringify(body.kind));
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/dashboard" className="font-ui text-sm text-accent">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-6 text-3xl">Billing</h1>
      <p className="mt-2 text-muted">
        Free to write. First project free. Pay for extra projects and AI — or subscribe.
      </p>

      {unlock && (
        <p className="mt-4 border border-warn bg-paper-deep px-4 py-3 text-sm">
          You need to unlock another project slot (or subscribe) to create project #2+.
        </p>
      )}
      {success && (
        <p className="mt-4 border border-accent bg-paper-deep px-4 py-3 text-sm text-accent">
          Payment received. Entitlements update within a few seconds.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <section className="mt-10 border border-line p-6">
        <h2 className="font-display text-xl">Project unlock</h2>
        <p className="mt-1 text-sm text-muted">~$9–12 one-time for an extra project slot.</p>
        <button
          type="button"
          disabled={!!loading}
          onClick={() => checkout({ kind: "project_unlock" })}
          className="font-ui mt-4 bg-accent px-4 py-2 text-paper disabled:opacity-50"
        >
          Unlock a project
        </button>
      </section>

      <section className="mt-6 border border-line p-6">
        <h2 className="font-display text-xl">AI credit packs</h2>
        <div className="font-ui mt-4 flex flex-wrap gap-3">
          {(
            [
              ["starter", "Starter · 250"],
              ["revision", "Revision · 900"],
              ["manuscript", "Manuscript · 2800"],
            ] as const
          ).map(([pack, label]) => (
            <button
              key={pack}
              type="button"
              disabled={!!loading}
              onClick={() => checkout({ kind: "credits", pack })}
              className="border border-line px-4 py-2 text-sm hover:border-accent"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 border border-accent p-6">
        <h2 className="font-display text-xl">Optional subscription</h2>
        <div className="font-ui mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!!loading}
            onClick={() => checkout({ kind: "subscribe", tier: "pro", interval: "monthly" })}
            className="bg-ink px-4 py-2 text-paper"
          >
            Pro monthly
          </button>
          <button
            type="button"
            disabled={!!loading}
            onClick={() => checkout({ kind: "subscribe", tier: "pro", interval: "yearly" })}
            className="border border-line px-4 py-2"
          >
            Pro yearly
          </button>
          <button
            type="button"
            disabled={!!loading}
            onClick={() => checkout({ kind: "subscribe", tier: "studio", interval: "monthly" })}
            className="bg-accent px-4 py-2 text-paper"
          >
            Studio monthly
          </button>
          <button
            type="button"
            disabled={!!loading}
            onClick={() => checkout({ kind: "subscribe", tier: "studio", interval: "yearly" })}
            className="border border-line px-4 py-2"
          >
            Studio yearly
          </button>
        </div>
        <button
          type="button"
          className="font-ui mt-4 text-sm text-accent underline"
          onClick={() => checkout({ kind: "portal" })}
        >
          Manage subscription (Stripe portal)
        </button>
      </section>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-10">Loading…</div>}>
      <BillingInner />
    </Suspense>
  );
}

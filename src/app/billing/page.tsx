"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { ClaimReferral } from "@/components/ClaimReferral";
import { SUB_ALLOWANCE } from "@/lib/types";

const REFERRAL_REWARD_CREDITS = 50;

function BillingInner() {
  const search = useSearchParams();
  const unlock = search.get("unlock");
  const success = search.get("success");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);

  async function syncPurchases() {
    setLoading("sync");
    setError(null);
    try {
      const res = await fetch("/api/stripe/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setBalance((data.balance ?? 0) + (data.monthly ?? 0));
      if (data.applied?.length) {
        setSyncNote(
          `Applied ${data.applied.length} purchase(s). Balance is now ${data.balance ?? 0} purchased credits.`
        );
      } else {
        setSyncNote(
          `Checked Stripe — no new purchases to apply. Purchased balance: ${data.balance ?? 0}.`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    if (!success) return;
    void syncPurchases();
  }, [success]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/referral");
        const data = await res.json();
        if (res.ok && data.link) setReferralLink(data.link as string);
      } catch {
        /* ignore */
      }
    })();
  }, []);

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

  async function copyReferral() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setReferralCopied(true);
      window.setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      setError("Could not copy link");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <ClaimReferral />
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
          Payment received. Syncing entitlements…
        </p>
      )}
      {syncNote && (
        <p className="mt-4 border border-accent bg-paper-deep px-4 py-3 text-sm text-accent">
          {syncNote}
          {balance !== null && (
            <>
              {" "}
              <Link href="/dashboard" className="underline">
                Back to dashboard
              </Link>
            </>
          )}
        </p>
      )}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <p className="font-ui mt-4 text-sm">
        <button
          type="button"
          disabled={!!loading}
          onClick={() => void syncPurchases()}
          className="text-accent underline disabled:opacity-50"
        >
          {loading === "sync" ? "Syncing…" : "Refresh purchases from Stripe"}
        </button>
      </p>

      <section className="mt-10 border border-line p-6">
        <h2 className="font-display text-xl">Project unlock</h2>
        <p className="mt-1 text-sm text-muted">
          <strong className="text-ink">$9</strong> one-time — unlock one extra project slot.
        </p>
        <button
          type="button"
          disabled={!!loading}
          onClick={() => checkout({ kind: "project_unlock" })}
          className="font-ui mt-4 bg-accent px-4 py-2 text-paper disabled:opacity-50"
        >
          Unlock a project — $9
        </button>
      </section>

      <section className="mt-6 border border-line p-6">
        <h2 className="font-display text-xl">AI credit packs</h2>
        <p className="mt-1 text-sm text-muted">One-time packs. Credits never expire.</p>
        <div className="font-ui mt-4 flex flex-wrap gap-3">
          {(
            [
              ["starter", "Starter · 250 credits · $5"],
              ["revision", "Revision · 900 credits"],
              ["manuscript", "Manuscript · 2,800 credits"],
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
        <p className="mt-1 text-sm text-muted">
          Unlimited project slots plus a monthly AI credit allowance. Cancel anytime in the Stripe
          portal.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="border border-line p-4">
            <h3 className="font-display text-lg">Pro</h3>
            <p className="mt-1 text-2xl text-ink">
              $16<span className="text-sm text-muted">/mo</span>
            </p>
            <p className="text-xs text-muted">or billed yearly at checkout</p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li>Unlimited projects</li>
              <li>{SUB_ALLOWANCE.pro} AI credits every month</li>
              <li>All critique actions & story bible tools</li>
              <li>DOCX / EPUB export & KDP checklist</li>
            </ul>
            <div className="font-ui mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!loading}
                onClick={() => checkout({ kind: "subscribe", tier: "pro", interval: "monthly" })}
                className="bg-ink px-3 py-2 text-sm text-paper disabled:opacity-50"
              >
                Pro monthly — $16
              </button>
              <button
                type="button"
                disabled={!!loading}
                onClick={() => checkout({ kind: "subscribe", tier: "pro", interval: "yearly" })}
                className="border border-line px-3 py-2 text-sm disabled:opacity-50"
              >
                Pro yearly
              </button>
            </div>
          </div>

          <div className="border border-accent p-4">
            <h3 className="font-display text-lg">Studio</h3>
            <p className="mt-1 text-2xl text-ink">
              $32<span className="text-sm text-muted">/mo</span>
            </p>
            <p className="text-xs text-muted">or billed yearly at checkout</p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li>Everything in Pro</li>
              <li>{SUB_ALLOWANCE.studio} AI credits every month</li>
              <li>Series tools & beta reader seats</li>
              <li>Bring your own API key (BYOK)</li>
              <li>Priority AI jobs</li>
            </ul>
            <div className="font-ui mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!loading}
                onClick={() =>
                  checkout({ kind: "subscribe", tier: "studio", interval: "monthly" })
                }
                className="bg-accent px-3 py-2 text-sm text-paper disabled:opacity-50"
              >
                Studio monthly — $32
              </button>
              <button
                type="button"
                disabled={!!loading}
                onClick={() =>
                  checkout({ kind: "subscribe", tier: "studio", interval: "yearly" })
                }
                className="border border-line px-3 py-2 text-sm disabled:opacity-50"
              >
                Studio yearly
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="font-ui mt-4 text-sm text-accent underline"
          onClick={() => checkout({ kind: "portal" })}
        >
          Manage subscription (Stripe portal)
        </button>
      </section>

      <section className="mt-6 border border-line p-6">
        <h2 className="font-display text-xl">Refer a writer</h2>
        <p className="mt-1 text-sm text-muted">
          Share your link. When someone signs up through it and buys credits, a project unlock, or a
          subscription, you get{" "}
          <strong className="text-ink">{REFERRAL_REWARD_CREDITS} AI credits</strong> — every time they
          pay.
        </p>
        {referralLink ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              readOnly
              value={referralLink}
              className="font-ui min-w-0 flex-1 border border-line bg-paper-deep/40 px-3 py-2 text-sm"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => void copyReferral()}
              className="font-ui shrink-0 border border-line px-4 py-2 text-sm hover:border-accent"
            >
              {referralCopied ? "Copied" : "Copy link"}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Loading your referral link…</p>
        )}
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

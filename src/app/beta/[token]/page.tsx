"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ClaimInfo = {
  email: string;
  displayName: string | null;
  projectId: string;
  projectTitle: string;
  status: string;
  hasAccount: boolean;
  nextPath: string;
  bookPath: string;
  loginUrl: string;
  signupUrl: string;
};

/** Legacy invite links land here: email identity → login/signup → dashboard (no direct manuscript unlock). */
export default function BetaClaimPage() {
  const params = useParams();
  const token = String(params.token || "");
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/beta/claim?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Invalid link");
        setInfo(data);
        try {
          sessionStorage.setItem("nw_beta_claim_token", token);
          sessionStorage.setItem("nw_beta_claim_email", data.email);
        } catch {
          /* ignore */
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Invalid link");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <p className="text-sm text-muted">Opening your invite…</p>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <p className="text-sm text-danger">{error || "Invite not found"}</p>
        <Link href="/beta/signup" className="mt-4 inline-block text-accent underline">
          Create a beta reader account
        </Link>
      </div>
    );
  }

  const signupHref = `/beta/signup?email=${encodeURIComponent(info.email)}&name=${encodeURIComponent(info.displayName || "")}&next=${encodeURIComponent("/beta/dashboard")}`;
  const loginHref = `/login?email=${encodeURIComponent(info.email)}&next=${encodeURIComponent("/beta/dashboard")}`;

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <p className="font-ui text-xs uppercase tracking-wide text-muted">Beta reader invite</p>
      <h1 className="font-display mt-2 text-3xl">{info.projectTitle}</h1>
      <p className="mt-3 text-sm text-muted">
        Beta reading now uses your Novelist Writer account. Sign in with{" "}
        <strong className="text-ink">{info.email}</strong>
        {info.hasAccount
          ? " (you already have an account)."
          : " and set a password to save your place and open your dashboard."}
      </p>

      <div className="font-ui mt-8 space-y-3">
        {info.hasAccount ? (
          <Link href={loginHref} className="block bg-accent px-4 py-3 text-center text-paper">
            Log in to continue
          </Link>
        ) : (
          <Link href={signupHref} className="block bg-accent px-4 py-3 text-center text-paper">
            Set a password & open dashboard
          </Link>
        )}
        <Link
          href={info.hasAccount ? signupHref : loginHref}
          className="block border border-line px-4 py-3 text-center text-sm text-accent"
        >
          {info.hasAccount ? "Need to create a password instead?" : "Already have an account? Log in"}
        </Link>
        <p className="pt-2 text-xs text-muted">
          After you sign in, your invites are linked automatically. Continue reading from your
          dashboard or{" "}
          <Link href={info.bookPath} className="text-accent underline">
            open this book
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

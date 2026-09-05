"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureAccountForEmail, getSessionEmail } from "@/lib/beta-auth-switch";

type ClaimInfo = {
  email: string;
  displayName: string | null;
  projectId: string;
  projectTitle: string;
  status: string;
  hasAccount: boolean;
  nextPath: string;
  bookPath: string;
};

/** Legacy invite links: email identity → login/signup → dashboard (no direct manuscript unlock). */
export default function BetaClaimPage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params.token || "");
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [res, current] = await Promise.all([
          fetch(`/api/beta/claim?token=${encodeURIComponent(token)}`),
          getSessionEmail(),
        ]);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Invalid link");
        setInfo(data);
        setSessionEmail(current);
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

  const inviteEmail = info?.email.trim().toLowerCase() || "";
  const wrongAccount =
    Boolean(sessionEmail && inviteEmail && sessionEmail !== inviteEmail);

  async function continueAsInvite(kind: "signup" | "login") {
    if (!info) return;
    setBusy(true);
    try {
      await ensureAccountForEmail(info.email);
      const next = encodeURIComponent("/beta/dashboard");
      const email = encodeURIComponent(info.email);
      const name = encodeURIComponent(info.displayName || "");
      if (kind === "signup") {
        router.push(`/beta/signup?email=${email}&name=${name}&next=${next}&switch=1`);
      } else {
        router.push(`/login?email=${email}&next=${next}&switch=1`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function stayAsCurrent() {
    setBusy(true);
    try {
      const supabase = createClient();
      await fetch("/api/profile/roles").catch(() => null);
      router.push("/beta/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <p className="font-ui text-xs uppercase tracking-wide text-muted">Beta reader invite</p>
      <h1 className="font-display mt-2 text-3xl">{info.projectTitle}</h1>
      <p className="mt-3 text-sm text-muted">
        This invite is for <strong className="text-ink">{info.email}</strong>
        {info.hasAccount
          ? ". Log in with that email to open your dashboard."
          : ". Set a password for that email to save your place and open your dashboard."}
      </p>

      {wrongAccount && (
        <div className="font-ui mt-6 border border-accent bg-paper p-4 text-sm">
          <p className="text-ink">
            You&apos;re currently signed in as{" "}
            <strong>{sessionEmail}</strong>, which is a different account.
          </p>
          <p className="mt-2 text-muted">
            To use this invite, switch to <strong className="text-ink">{info.email}</strong>{" "}
            (you&apos;ll set a password or log in). Or stay on your current account and open the
            beta dashboard.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              className="bg-accent px-4 py-2.5 text-paper disabled:opacity-60"
              onClick={() => void continueAsInvite(info.hasAccount ? "login" : "signup")}
            >
              {busy
                ? "Switching…"
                : info.hasAccount
                  ? `Sign out & log in as ${info.email}`
                  : `Sign out & set password for ${info.email}`}
            </button>
            <button
              type="button"
              disabled={busy}
              className="border border-line px-4 py-2.5 text-accent disabled:opacity-60"
              onClick={() => void stayAsCurrent()}
            >
              Stay as {sessionEmail}
            </button>
          </div>
        </div>
      )}

      {!wrongAccount && (
        <div className="font-ui mt-8 space-y-3">
          {info.hasAccount ? (
            <button
              type="button"
              disabled={busy}
              className="block w-full bg-accent px-4 py-3 text-center text-paper disabled:opacity-60"
              onClick={() => void continueAsInvite("login")}
            >
              {busy ? "…" : "Log in to continue"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="block w-full bg-accent px-4 py-3 text-center text-paper disabled:opacity-60"
              onClick={() => void continueAsInvite("signup")}
            >
              {busy ? "…" : "Set a password & open dashboard"}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            className="block w-full border border-line px-4 py-3 text-center text-sm text-accent disabled:opacity-60"
            onClick={() => void continueAsInvite(info.hasAccount ? "signup" : "login")}
          >
            {info.hasAccount
              ? "Need to create a password instead?"
              : "Already have an account? Log in"}
          </button>
          <p className="pt-2 text-xs text-muted">
            After you sign in as {info.email}, your invites are linked automatically.{" "}
            <Link href={info.bookPath} className="text-accent underline">
              Open this book
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}

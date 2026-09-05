"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { rememberSide } from "@/lib/beta-platform";
import { ensureAccountForEmail, getSessionEmail } from "@/lib/beta-auth-switch";

export default function BetaSignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("/beta/dashboard");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("email");
    const n = params.get("name");
    const next = params.get("next");
    if (e) setEmail(e);
    if (n) setName(n);
    if (next && next.startsWith("/")) setNextPath(next);

    void (async () => {
      const current = await getSessionEmail();
      setSessionEmail(current);
      const intended = (e || "").trim().toLowerCase();
      if (current && intended && current !== intended) {
        // Already signed out intent via claim page; refresh session state
      }
    })();
  }, []);

  const wrongAccount =
    Boolean(sessionEmail && email.trim() && sessionEmail !== email.trim().toLowerCase());

  async function switchToIntended() {
    if (!email.trim()) return;
    setSwitching(true);
    try {
      await ensureAccountForEmail(email);
      setSessionEmail(null);
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (wrongAccount) {
        await ensureAccountForEmail(email);
        setSessionEmail(null);
      }

      const supabase = createClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name, signup_role: "beta_reader" },
          emailRedirectTo: `${appUrl}${nextPath}`,
        },
      });
      if (err) {
        if (/already registered|already been registered|User already/i.test(err.message)) {
          setError("Account exists — log in with this email to open your dashboard.");
          return;
        }
        throw err;
      }

      if (data.session) {
        await fetch("/api/profile/roles", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enableBetaReader: true, is_author: false }),
        });
        rememberSide("beta");
        await fetch("/api/beta/dashboard").catch(() => null);
        router.push(nextPath);
        router.refresh();
        return;
      }
      setCheckEmail(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <Link href="/" className="font-display text-2xl text-ink">
          Novelist Writer
        </Link>
        <div className="font-ui mt-10 w-full max-w-sm border border-accent bg-paper p-6 text-center">
          <h1 className="font-display text-2xl text-ink">Check your email</h1>
          <p className="mt-3 text-sm text-muted">
            We sent a confirmation link to <strong className="text-ink">{email}</strong>.
            Open it, then log in to open your beta dashboard.
          </p>
          <Link
            href={`/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}&switch=1`}
            className="mt-6 inline-block w-full bg-accent py-2.5 text-paper hover:bg-accent-soft"
          >
            Go to log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Link href="/" className="font-display text-2xl text-ink">
        Novelist Writer
      </Link>
      <form onSubmit={onSubmit} className="font-ui mt-10 w-full max-w-sm space-y-4">
        <h1 className="font-display text-3xl">Beta reader signup</h1>
        <p className="text-sm text-muted">
          Set a password for this email to open your beta dashboard.
        </p>
        {wrongAccount && (
          <div className="border border-accent bg-paper-deep/40 px-3 py-3 text-sm text-ink">
            <p>
              You&apos;re signed in as <strong>{sessionEmail}</strong>. This form is for{" "}
              <strong>{email}</strong>.
            </p>
            <button
              type="button"
              disabled={switching}
              className="mt-2 text-accent underline disabled:opacity-60"
              onClick={() => void switchToIntended()}
            >
              {switching ? "Signing out…" : `Sign out of ${sessionEmail} and continue`}
            </button>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <label className="block text-sm">
          Display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-line bg-paper px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-line bg-paper px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-line bg-paper px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={loading || wrongAccount}
          className="w-full bg-accent py-2.5 text-paper hover:bg-accent-soft disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create reader account"}
        </button>
        <p className="text-center text-sm text-muted">
          Have an account?{" "}
          <Link
            href={`/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}&switch=1`}
            className="text-accent underline"
          >
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}

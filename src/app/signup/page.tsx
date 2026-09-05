"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setRefCode(ref.trim().toUpperCase());
  }, []);

  async function claimPendingReferral() {
    try {
      await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refCode ? { code: refCode } : {}),
      });
    } catch {
      /* ignore */
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const createRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: name,
          role: "author",
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        if (createData.code === "already_registered") {
          setError("Account exists — log in instead.");
          return;
        }
        throw new Error(createData.error || "Signup failed");
      }

      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;

      await claimPendingReferral();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Link href="/" className="font-display text-2xl text-ink">
        Novelist Writer
      </Link>
      <form onSubmit={onSubmit} className="font-ui mt-10 w-full max-w-sm space-y-4">
        <h1 className="font-display text-3xl">Create account</h1>
        <p className="text-sm text-muted">First project free. AI never writes your novel.</p>
        {refCode && (
          <p className="border border-line bg-paper-deep/40 px-3 py-2 text-xs text-muted">
            Invited by a fellow writer — referral saved for 30 days if you leave and come back.
          </p>
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
          disabled={loading}
          className="w-full bg-accent py-2.5 text-paper hover:bg-accent-soft disabled:opacity-60"
        >
          {loading ? "Creating…" : "Start writing free"}
        </button>
        <p className="text-center text-sm text-muted">
          Have an account?{" "}
          <Link href="/login" className="text-accent underline">
            Log in
          </Link>
        </p>
        <p className="text-center text-sm text-muted">
          Beta reader?{" "}
          <Link href="/beta/signup" className="text-accent underline">
            Sign up to read
          </Link>
        </p>
      </form>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => {
        /* ignore */
      });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
        <h1 className="font-display text-3xl">Log in</h1>
        {error && <p className="text-sm text-danger">{error}</p>}
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
          {loading ? "Signing in…" : "Log in"}
        </button>
        <p className="text-center text-sm text-muted">
          No account?{" "}
          <Link href="/signup" className="text-accent underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}

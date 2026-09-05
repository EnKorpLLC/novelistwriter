"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { homePathForRoles, rememberSide, readRememberedSide, type AppSide } from "@/lib/beta-platform";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const search = useSearchParams();
  const nextParam = search.get("next");

  useEffect(() => {
    const prefill = search.get("email");
    if (prefill) setEmail(prefill);
  }, [search]);

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

      let roles = { is_author: true, is_beta_reader: false };
      let hasBetaInvites = false;
      try {
        // Sync: if this email has beta invites, enable beta-reader role automatically
        const rolesRes = await fetch("/api/profile/roles");
        if (rolesRes.ok) {
          const json = await rolesRes.json();
          roles = json.roles || roles;
          hasBetaInvites = Boolean(json.hasBetaInvites);
        }
        await fetch("/api/beta/dashboard").catch(() => null);
      } catch {
        /* ignore */
      }

      const lastSide: AppSide | null = readRememberedSide();

      // Authors whose email is on beta invites land on the beta dashboard
      // (unless a specific next URL was requested).
      let dest: string;
      if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
        dest = nextParam;
      } else if (hasBetaInvites) {
        dest = "/beta/dashboard";
        rememberSide("beta");
      } else {
        dest = homePathForRoles(roles, null, lastSide);
      }

      if (dest.startsWith("/beta")) rememberSide("beta");
      else if (dest.startsWith("/dashboard") || dest.startsWith("/project")) {
        rememberSide("author");
      }

      router.push(dest);
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
        <p className="text-sm text-muted">One account for authors and beta readers.</p>
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
          Author?{" "}
          <Link href="/signup" className="text-accent underline">
            Sign up to write
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

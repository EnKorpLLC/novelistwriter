"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name },
          emailRedirectTo: `${appUrl}/dashboard`,
        },
      });
      if (err) throw err;
      if (data.session) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      // Email confirmation required — no session until they click the link
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
            Open it, then log in to start writing.
          </p>
          <Link
            href="/login"
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
        <h1 className="font-display text-3xl">Create account</h1>
        <p className="text-sm text-muted">First project free. AI never writes your novel.</p>
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
      </form>
    </div>
  );
}

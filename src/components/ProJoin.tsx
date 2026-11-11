"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSessionEmail } from "@/lib/beta-auth-switch";

/** /pros/join: a free pro account (or the one you're signed in with), then on to the profile. */
export function ProJoin({ invite }: { invite: string | null }) {
  const router = useRouter();
  const [session, setSession] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void getSessionEmail().then(setSession);
  }, []);

  async function start(displayName?: string) {
    const r = await fetch("/api/pro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", name: displayName, invite }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Couldn't start your profile");
    router.push("/pro");
    router.refresh();
  }

  async function signUp() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName: name, role: "pro" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.code === "already_registered" ? "You already have an account with this email. Log in instead." : d.error || "Couldn't create your account");
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      await start(name);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't create your account");
      setBusy(false);
    }
  }

  const next = `/pros/join${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
  const input = "mt-1 block w-full border border-line bg-paper px-3 py-2 text-sm text-ink";
  return (
    <div className="font-ui mx-auto max-w-md px-6 py-14">
      <p className="text-xs uppercase tracking-[0.2em] text-accent">Founding pros</p>
      <h1 className="font-display mt-2 text-3xl">Join the marketplace</h1>
      <p className="mt-2 text-sm text-muted">
        A pro account is free. Next you&apos;ll set up your profile: what you do, a short bio, your rates, and a few portfolio pieces. We review every one by
        hand.
        {invite ? " You were invited, so you're near the front of the line." : ""}
      </p>
      {session === undefined ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : session ? (
        <div className="mt-6 space-y-3 text-sm">
          <p>
            You&apos;re signed in as <strong>{session}</strong>. Your pro profile will be part of this account.
          </p>
          <button
            type="button"
            disabled={busy}
            className="bg-accent px-4 py-2 text-paper disabled:opacity-60"
            onClick={() => {
              setBusy(true);
              setMsg(null);
              void start().catch((e: unknown) => {
                setMsg(e instanceof Error ? e.message : "Couldn't start your profile");
                setBusy(false);
              });
            }}
          >
            {busy ? "Starting…" : "Set up my pro profile"}
          </button>
        </div>
      ) : (
        <form
          className="mt-6 space-y-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void signUp();
          }}
        >
          <label className="block text-xs text-muted">
            Your name (as authors will see it)
            <input value={name} onChange={(e) => setName(e.target.value)} required className={input} />
          </label>
          <label className="block text-xs text-muted">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={input} />
          </label>
          <label className="block text-xs text-muted">
            Password (6 or more characters)
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={input} />
          </label>
          <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-paper disabled:opacity-60">
            {busy ? "Creating your account…" : "Create my free pro account"}
          </button>
          <p className="text-xs text-muted">
            Already have an account (as an author, reader, or narrator)?{" "}
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-accent underline">
              Log in
            </Link>{" "}
            and come back here.
          </p>
        </form>
      )}
      {msg && <p className="mt-3 text-sm text-danger">{msg}</p>}
    </div>
  );
}

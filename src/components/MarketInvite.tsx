"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureAccountForEmail, getSessionEmail } from "@/lib/beta-auth-switch";

type Invite = { jobId: string; accepted: boolean; email: string; author: string; title: string; brief: string; type: string; deadline: string | null; closed: boolean; hasAccount: boolean };

/** /hire/invite/[token]: an author asked their own editor or artist for a quote. */
export function MarketInvite({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, email] = await Promise.all([fetch(`/api/market/invite/${encodeURIComponent(token)}`), getSessionEmail()]);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error || "Invite not found");
    setInvite(d);
    setSession(email);
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);

  async function accept() {
    const r = await fetch(`/api/market/invite/${encodeURIComponent(token)}`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Couldn't accept the invite");
    router.push(`/hire/job/${d.jobId}`);
    router.refresh();
  }

  async function signUpAndAccept() {
    if (!invite) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invite.email, password, displayName: name, role: "pro" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.code === "already_registered" ? "You already have an account. Log in instead." : d.error || "Couldn't create your account");
      const { error: signInErr } = await createClient().auth.signInWithPassword({ email: invite.email, password });
      if (signInErr) throw signInErr;
      await accept();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't create your account");
      setBusy(false);
    }
  }

  if (error) return <p className="font-ui mx-auto max-w-lg px-6 py-16 text-sm text-danger">{error}</p>;
  if (!invite || session === undefined) return <p className="font-ui mx-auto max-w-lg px-6 py-16 text-sm text-muted">Loading…</p>;
  const rightUser = session === invite.email.toLowerCase();
  const input = "mt-1 block w-full border border-line bg-paper px-3 py-2 text-sm text-ink";

  return (
    <div className="font-ui mx-auto max-w-lg px-6 py-12 text-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-accent">A request for a quote</p>
      <h1 className="font-display mt-2 text-3xl">{invite.title}</h1>
      <p className="mt-1 text-muted">
        {invite.author} would like to hire you as a {invite.type.toLowerCase()}
        {invite.deadline ? `, by ${invite.deadline}` : ""}.
      </p>
      <p className="mt-4 whitespace-pre-wrap border-l-2 border-line pl-3">{invite.brief}</p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-muted">
        <li>You set the price and milestones in your quote. You keep your full price; the author pays our 10% on top.</li>
        <li>The author pays each milestone before you start it, and we hold it until they approve your delivery. Fourteen days without an answer counts as approved.</li>
        <li>Your account is free. Payouts go to your bank through Stripe.</li>
      </ul>
      {invite.closed ? (
        <p className="mt-6 text-danger">This request was closed.</p>
      ) : invite.accepted && rightUser ? (
        <Link href={`/hire/job/${invite.jobId}`} className="mt-6 inline-block bg-accent px-4 py-2 text-paper">
          Open the job
        </Link>
      ) : session && !rightUser ? (
        <div className="mt-6 space-y-2">
          <p>
            You&apos;re signed in as <strong>{session}</strong>, but this request is for <strong>{invite.email}</strong>.
          </p>
          <button type="button" className="border border-line px-3 py-1.5" onClick={() => void ensureAccountForEmail(invite.email).then(() => setSession(null))}>
            Switch account
          </button>
        </div>
      ) : rightUser ? (
        <button
          type="button"
          disabled={busy}
          className="mt-6 bg-accent px-4 py-2 text-paper disabled:opacity-60"
          onClick={() => {
            setBusy(true);
            void accept().catch((e: unknown) => {
              setMsg(e instanceof Error ? e.message : "Couldn't accept");
              setBusy(false);
            });
          }}
        >
          {busy ? "Opening…" : "Read it and send a quote"}
        </button>
      ) : invite.hasAccount ? (
        <p className="mt-6">
          You already have an account with {invite.email}.{" "}
          <Link href={`/login?next=${encodeURIComponent(`/hire/invite/${token}`)}`} className="text-accent underline">
            Log in
          </Link>{" "}
          to answer.
        </p>
      ) : (
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void signUpAndAccept();
          }}
        >
          <p>Make a free account with {invite.email} to answer.</p>
          <label className="block text-xs text-muted">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} required className={input} />
          </label>
          <label className="block text-xs text-muted">
            Password (6 or more characters)
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={input} />
          </label>
          <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-paper disabled:opacity-60">
            {busy ? "Creating your account…" : "Create my account and open the request"}
          </button>
        </form>
      )}
      {msg && <p className="mt-3 text-danger">{msg}</p>}
    </div>
  );
}

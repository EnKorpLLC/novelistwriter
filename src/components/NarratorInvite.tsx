"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureAccountForEmail, getSessionEmail } from "@/lib/beta-auth-switch";
import { NarrationAgreement } from "@/components/NarrationAgreement";
import { normalizeTerms, type NarrationTerms } from "@/lib/narration";

type Invite = {
  book: string;
  author: string;
  email: string;
  narratorName: string;
  status: string;
  terms: NarrationTerms;
  termsVersion: number;
  message: string;
  jobId: string;
  hasAccount: boolean;
};

/** /narrate/[token]: read the agreement, make a free narrator account (or sign in), then accept or decline. */
export function NarratorInvite({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<"declined" | null>(null);

  const load = useCallback(async () => {
    const [res, email] = await Promise.all([fetch(`/api/narration/invite/${encodeURIComponent(token)}`), getSessionEmail()]);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || "Invite not found");
    setInvite({ ...data, terms: normalizeTerms(data.terms) });
    setName((n) => n || data.narratorName || "");
    setSessionEmail(email);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(action: "accept" | "decline") {
    if (!invite) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/narration/invite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "accept" ? { action, termsVersion: invite.termsVersion, name } : { action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't send that");
      if (action === "accept") {
        router.push(`/narrator/book/${data.jobId}`);
        router.refresh();
      } else setDone("declined");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't send that");
      if (e instanceof Error && /updated the terms/.test(e.message)) void load();
    } finally {
      setBusy(false);
    }
  }

  async function signUpAndAccept() {
    if (!invite) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invite.email, password, displayName: name, role: "narrator" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.code === "already_registered" ? "You already have an account. Log in instead." : data.error || "Couldn't create your account");
      const { error: signInErr } = await createClient().auth.signInWithPassword({ email: invite.email, password });
      if (signInErr) throw signInErr;
      setSessionEmail(invite.email.toLowerCase());
      await answer("accept");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't create your account");
      setBusy(false);
    }
  }

  async function switchAccount() {
    if (!invite) return;
    await ensureAccountForEmail(invite.email);
    setSessionEmail(null);
  }

  if (error) {
    return (
      <div className="font-ui mx-auto max-w-lg px-6 py-16">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }
  if (!invite || sessionEmail === undefined) return <p className="font-ui mx-auto max-w-lg px-6 py-16 text-sm text-muted">Opening your invite…</p>;

  const signedInRight = sessionEmail === invite.email.toLowerCase();
  const loginHref = `/login?email=${encodeURIComponent(invite.email)}&next=${encodeURIComponent(`/narrate/${token}`)}&switch=1`;

  return (
    <div className="font-ui mx-auto max-w-2xl px-6 py-12">
      <p className="text-xs uppercase tracking-wide text-muted">Narration invite</p>
      <h1 className="font-display mt-2 text-3xl">{invite.book}</h1>
      <p className="mt-2 text-sm text-muted">
        {invite.author} would like you to narrate their audiobook. You record in your browser with the script on screen; your recordings stay on your own computer, and the account is free.
      </p>
      {invite.message && <blockquote className="mt-4 border-l-2 border-accent pl-3 text-sm italic text-ink">“{invite.message}”</blockquote>}

      {invite.status !== "invited" ? (
        <div className="mt-6 border border-line p-4 text-sm">
          {invite.status === "active" ? (
            <>
              <p>This job is under way.</p>
              <Link href="/narrator" className="mt-2 inline-block text-accent underline">
                Open your narrator dashboard
              </Link>
            </>
          ) : (
            <p className="text-muted">This invite is closed{invite.status === "cancelled" ? ": the author cancelled it" : invite.status === "declined" ? ": it was declined" : ""}.</p>
          )}
        </div>
      ) : done === "declined" ? (
        <p className="mt-6 border border-line p-4 text-sm">You declined. We&apos;ve let {invite.author} know.</p>
      ) : (
        <>
          <section className="mt-8 border border-line p-4 sm:p-5">
            <h2 className="font-display text-xl">The agreement</h2>
            <p className="mt-1 text-xs text-muted">
              Held deposits and payouts through Novelist Writer open in an upcoming update. Until then nothing is charged or paid here, and you can start with the checkpoint.
            </p>
            <div className="mt-3">
              <NarrationAgreement terms={invite.terms} book={invite.book} author={invite.author} narrator={name || "the narrator"} viewer="narrator" />
            </div>
          </section>

          <section className="mt-6 border border-accent p-4 sm:p-5">
            {sessionEmail && !signedInRight ? (
              <>
                <p className="text-sm">
                  You&apos;re signed in as <b>{sessionEmail}</b>, but this invite is for <b>{invite.email}</b>.
                </p>
                <button type="button" className="mt-3 bg-accent px-4 py-2 text-sm text-paper" onClick={() => void switchAccount()}>
                  Sign out and continue as {invite.email}
                </button>
              </>
            ) : (
              <>
                <label className="block text-sm">
                  <span className="text-muted">Your name as it should appear in the credits</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border border-line bg-paper px-2 py-2" />
                </label>
                {!signedInRight && !invite.hasAccount && (
                  <label className="mt-3 block text-sm">
                    <span className="text-muted">Choose a password for {invite.email}</span>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} className="mt-1 w-full border border-line bg-paper px-2 py-2" />
                  </label>
                )}
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>I&apos;ve read the agreement and accept it.</span>
                </label>
                {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {signedInRight ? (
                    <button type="button" disabled={busy || !agree || !name.trim()} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50" onClick={() => void answer("accept")}>
                      {busy ? "Accepting…" : "Accept and open the script"}
                    </button>
                  ) : invite.hasAccount ? (
                    <Link href={loginHref} className="bg-accent px-4 py-2 text-sm text-paper">
                      Log in as {invite.email} to accept
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !agree || !name.trim() || password.length < 6}
                      className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
                      onClick={() => void signUpAndAccept()}
                    >
                      {busy ? "Setting up…" : "Create my free narrator account and accept"}
                    </button>
                  )}
                  {signedInRight && (
                    <button type="button" className="text-sm text-muted underline" onClick={() => setDeclining((d) => !d)}>
                      Decline
                    </button>
                  )}
                  {!signedInRight && !invite.hasAccount && (
                    <Link href={loginHref} className="text-sm text-muted underline">
                      I already have an account
                    </Link>
                  )}
                </div>
                {declining && signedInRight && (
                  <div className="mt-3 text-sm">
                    <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="A note for the author (optional)" className="w-full border border-line bg-paper p-2" />
                    <button type="button" disabled={busy} className="mt-2 border border-line px-3 py-1.5" onClick={() => void answer("decline")}>
                      Decline the invite
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

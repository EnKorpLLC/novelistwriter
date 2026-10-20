"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ContactForm() {
  const search = useSearchParams();
  const passwordHelp = search.get("topic") === "password";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(passwordHelp ? "Password help" : "");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user?.email) setEmail((cur) => cur || data.user!.email!);
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, company }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="font-ui mt-8 border border-line p-5 text-sm">
        <p className="text-ink">Message received. We&apos;ll reply to {email}.</p>
        <p className="mt-2 text-muted">
          Locked out? Try{" "}
          <Link href="/login" className="text-accent underline">
            Forgot password
          </Link>{" "}
          on the login page too. It emails a reset link right away.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="font-ui mt-8 space-y-4">
      {passwordHelp && (
        <p className="border border-line bg-paper-deep/40 px-3 py-2 text-sm text-ink">
          Tell us the email on your account. We can send a fresh reset link or set a temporary
          password for you.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <label className="block text-sm">
        Name
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
        Subject
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 w-full border border-line bg-paper px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Message
        <textarea
          required
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full border border-line bg-paper px-3 py-2"
        />
      </label>
      <label className="hidden" aria-hidden="true">
        Company
        <input
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

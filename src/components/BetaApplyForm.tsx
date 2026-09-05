"use client";

import { useEffect, useState } from "react";
import type { BetaApplicationForm, BetaFormField } from "@/lib/beta-form";
import { normalizeBetaApplicationForm } from "@/lib/beta-form";
import { BetaFormFields } from "@/components/BetaFormFields";

function formatAccessMessage(data: {
  message?: string;
  reason?: string;
  error?: string;
}): string {
  if (data.message && data.reason) return `${data.message} ${data.reason}`;
  return data.message || data.error || "Could not check access.";
}

export function BetaApplyForm({
  projectId,
  form: initialForm,
}: {
  projectId: string;
  form?: BetaApplicationForm;
  /** @deprecated use form */
  fields?: BetaFormField[];
}) {
  const [form, setForm] = useState<BetaApplicationForm>(
    initialForm || { intro: "", contentWarnings: "", fields: [] }
  );
  const [phase, setPhase] = useState<"apply" | "unlock">("apply");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [returningEmail, setReturningEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [accessMsg, setAccessMsg] = useState("");
  const [returningMsg, setReturningMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [returningBusy, setReturningBusy] = useState(false);
  const [loadingFields, setLoadingFields] = useState(!initialForm);

  useEffect(() => {
    if (initialForm) {
      setForm(initialForm);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/beta/apply?projectId=${encodeURIComponent(projectId)}`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          setForm(normalizeBetaApplicationForm(data.form || { fields: data.fields || [] }));
        }
      } finally {
        if (!cancelled) setLoadingFields(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialForm]);

  async function lookupByEmail(lookupEmail: string) {
    const res = await fetch("/api/beta/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, email: lookupEmail }),
    });
    const data = await res.json();
    if (data.code === "ok" && data.readUrl) {
      window.location.href = data.readUrl as string;
      return null;
    }
    return formatAccessMessage(data);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/beta/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, email, displayName, answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || data.message || "Could not send request.");
        return;
      }
      setMsg(data.message || "Application submitted.");
      if (data.unlockReady) setPhase("unlock");
    } finally {
      setBusy(false);
    }
  }

  async function checkAccess(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAccessMsg("");
    try {
      const message = await lookupByEmail(email);
      if (message) setAccessMsg(message);
    } finally {
      setBusy(false);
    }
  }

  async function checkReturning(e: React.FormEvent) {
    e.preventDefault();
    setReturningBusy(true);
    setReturningMsg("");
    try {
      const message = await lookupByEmail(returningEmail);
      if (message) setReturningMsg(message);
    } finally {
      setReturningBusy(false);
    }
  }

  if (loadingFields) {
    return <p className="font-ui mt-8 text-sm text-muted">Loading application…</p>;
  }

  if (phase === "unlock") {
    return (
      <form onSubmit={(e) => void checkAccess(e)} className="font-ui mt-8 space-y-4">
        {msg ? <p className="text-sm text-ink">{msg}</p> : null}
        <p className="text-sm text-muted">
          Enter the email you applied with to unlock the manuscript or check your status.
        </p>
        <label className="block text-sm">
          <span className="text-[10px] uppercase tracking-wide text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="bg-accent px-4 py-2 text-paper disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock / check status"}
        </button>
        {accessMsg ? <p className="text-sm text-muted">{accessMsg}</p> : null}
      </form>
    );
  }

  return (
    <div className="font-ui mt-8 space-y-8">
      <form
        onSubmit={(e) => void checkReturning(e)}
        className="space-y-3 border border-line bg-paper-deep/30 p-4"
      >
        <div>
          <h2 className="font-display text-xl text-ink">Already applied / approved?</h2>
          <p className="mt-1 text-sm text-muted">
            Enter the email you used before. If you’re approved, you’ll go straight to the
            manuscript.
          </p>
        </div>
        <label className="block text-sm">
          <span className="text-[10px] uppercase tracking-wide text-muted">Email</span>
          <input
            type="email"
            required
            value={returningEmail}
            onChange={(e) => setReturningEmail(e.target.value)}
            placeholder="you@email.com"
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={returningBusy || !returningEmail.trim()}
          className="bg-accent px-4 py-2 text-paper disabled:opacity-50"
        >
          {returningBusy ? "Checking…" : "Go to reading"}
        </button>
        {returningMsg ? <p className="text-sm text-muted">{returningMsg}</p> : null}
      </form>

      <div className="border-t border-line pt-8">
        <h2 className="font-display text-xl text-ink">New application</h2>
        <p className="mt-1 text-sm text-muted">
          First time here? Fill this out to request access.
        </p>
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4">
          <BetaFormFields
            form={form}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            email={email}
            onEmailChange={setEmail}
            answers={answers}
            onAnswersChange={setAnswers}
          />
          <button
            type="submit"
            disabled={busy}
            className="bg-accent px-4 py-2 text-paper disabled:opacity-50"
          >
            {busy ? "Sending…" : "Request to beta read"}
          </button>
          {msg && <p className="text-sm text-muted">{msg}</p>}
        </form>
      </div>
    </div>
  );
}

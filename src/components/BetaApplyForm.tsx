"use client";

import { useEffect, useState } from "react";
import type { BetaApplicationForm, BetaFormField } from "@/lib/beta-form";
import { normalizeBetaApplicationForm } from "@/lib/beta-form";
import { BetaFormFields } from "@/components/BetaFormFields";

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
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/beta/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, email, answers }),
      });
      const data = await res.json();
      setMsg(data.message || data.error || (res.ok ? "Request sent." : "Could not send request."));
    } finally {
      setBusy(false);
    }
  }

  if (loadingFields) {
    return <p className="font-ui mt-8 text-sm text-muted">Loading application…</p>;
  }

  return (
    <form onSubmit={submit} className="font-ui mt-8 space-y-4">
      <BetaFormFields
        form={form}
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
  );
}

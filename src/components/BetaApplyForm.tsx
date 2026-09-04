"use client";

import { useEffect, useState } from "react";
import type { BetaApplicationForm, BetaFormField } from "@/lib/beta-form";
import { followUpAnswerKey, normalizeBetaApplicationForm } from "@/lib/beta-form";

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

  function setAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }

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
      {form.intro ? (
        <div className="whitespace-pre-wrap border border-line bg-paper-deep/30 px-3 py-3 text-sm leading-relaxed text-ink">
          {form.intro}
        </div>
      ) : null}

      {form.contentWarnings ? (
        <div className="border border-warn/40 bg-warn/10 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wide text-warn">Content / trigger warnings</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {form.contentWarnings}
          </p>
        </div>
      ) : null}

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

      {form.fields.map((field) => {
        const yesNo = (answers[field.id] || "").toLowerCase();
        const follow =
          field.type === "yesno"
            ? yesNo === "yes"
              ? field.followUpYes
              : yesNo === "no"
                ? field.followUpNo
                : undefined
            : undefined;
        const followKey =
          yesNo === "yes" || yesNo === "no" ? followUpAnswerKey(field.id, yesNo) : "";

        return (
          <div key={field.id} className="space-y-2">
            <label className="block text-sm">
              <span className="text-[10px] uppercase tracking-wide text-muted">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              {field.type === "long" ? (
                <textarea
                  required={field.required}
                  rows={4}
                  value={answers[field.id] || ""}
                  onChange={(e) => setAnswer(field.id, e.target.value)}
                  className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
                />
              ) : field.type === "yesno" ? (
                <select
                  required={field.required}
                  value={answers[field.id] || ""}
                  onChange={(e) => setAnswer(field.id, e.target.value)}
                  className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">Choose…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              ) : (
                <input
                  required={field.required}
                  value={answers[field.id] || ""}
                  onChange={(e) => setAnswer(field.id, e.target.value)}
                  className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
                />
              )}
            </label>

            {follow?.enabled && followKey ? (
              <label className="ml-3 block border-l-2 border-accent/40 pl-3 text-sm">
                <span className="text-[10px] uppercase tracking-wide text-muted">
                  {follow.label}
                  {follow.required ? " *" : ""}
                </span>
                {follow.type === "long" ? (
                  <textarea
                    required={follow.required}
                    rows={3}
                    value={answers[followKey] || ""}
                    onChange={(e) => setAnswer(followKey, e.target.value)}
                    className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                ) : (
                  <input
                    required={follow.required}
                    value={answers[followKey] || ""}
                    onChange={(e) => setAnswer(followKey, e.target.value)}
                    className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                )}
              </label>
            ) : null}
          </div>
        );
      })}

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

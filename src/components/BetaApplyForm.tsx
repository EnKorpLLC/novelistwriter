"use client";

import { useEffect, useState } from "react";
import type { BetaFormField } from "@/lib/beta-form";

export function BetaApplyForm({
  projectId,
  fields: initialFields,
}: {
  projectId: string;
  fields?: BetaFormField[];
}) {
  const [fields, setFields] = useState<BetaFormField[]>(initialFields || []);
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingFields, setLoadingFields] = useState(!initialFields);

  useEffect(() => {
    if (initialFields) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/beta/apply?projectId=${encodeURIComponent(projectId)}`);
        const data = await res.json();
        if (!cancelled && res.ok) setFields(data.fields || []);
      } finally {
        if (!cancelled) setLoadingFields(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialFields]);

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

      {fields.map((field) => (
        <label key={field.id} className="block text-sm">
          <span className="text-[10px] uppercase tracking-wide text-muted">
            {field.label}
            {field.required ? " *" : ""}
          </span>
          {field.type === "long" ? (
            <textarea
              required={field.required}
              rows={4}
              value={answers[field.id] || ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
              className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
            />
          ) : field.type === "yesno" ? (
            <select
              required={field.required}
              value={answers[field.id] || ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
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
              onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
              className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
            />
          )}
        </label>
      ))}

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

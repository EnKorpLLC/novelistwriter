"use client";

import type { BetaApplicationForm } from "@/lib/beta-form";
import { followUpAnswerKey } from "@/lib/beta-form";

export function BetaFormFields({
  form,
  email,
  onEmailChange,
  displayName,
  onDisplayNameChange,
  answers,
  onAnswersChange,
  showEmail = true,
  showName = true,
}: {
  form: BetaApplicationForm;
  email?: string;
  onEmailChange?: (value: string) => void;
  displayName?: string;
  onDisplayNameChange?: (value: string) => void;
  answers: Record<string, string>;
  onAnswersChange: (next: Record<string, string>) => void;
  showEmail?: boolean;
  showName?: boolean;
}) {
  function setAnswer(id: string, value: string) {
    onAnswersChange({ ...answers, [id]: value });
  }

  return (
    <div className="space-y-4">
      {form.intro ? (
        <div className="whitespace-pre-wrap border border-line bg-paper-deep/30 px-3 py-3 text-sm leading-relaxed text-ink">
          {form.intro}
        </div>
      ) : null}

      {form.contentWarnings ? (
        <div className="border border-warn/40 bg-warn/10 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wide text-muted">Content / trigger warnings</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {form.contentWarnings}
          </p>
        </div>
      ) : null}

      {showName && onDisplayNameChange != null && displayName != null ? (
        <label className="block text-sm">
          <span className="text-[10px] uppercase tracking-wide text-muted">
            What should we call you?
          </span>
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="Your name"
            maxLength={80}
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      ) : null}

      {showEmail && onEmailChange != null && email != null ? (
        <label className="block text-sm">
          <span className="text-[10px] uppercase tracking-wide text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@email.com"
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      ) : null}

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
    </div>
  );
}

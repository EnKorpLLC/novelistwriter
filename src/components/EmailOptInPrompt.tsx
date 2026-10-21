"use client";

import { useState } from "react";

export const SPAM_TIP =
  "Check your spam or Promotions folder for our first email. Mark it Not spam and add the sender to your contacts so reminders reach your inbox.";

/** Unchecked-by-default consent box for signup forms. */
export function EmailConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="text-sm">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-muted">
          Email me about my account: reading and Studio reminders, and new books from authors I
          follow.
        </span>
      </label>
      {checked && <p className="mt-1 pl-6 text-xs text-muted">{SPAM_TIP}</p>}
    </div>
  );
}

/** One-time ask shown on dashboards to accounts that haven't decided about emails yet. */
export function EmailOptInPrompt({ audience }: { audience: "author" | "reader" }) {
  const [state, setState] = useState<"ask" | "busy" | "yes" | "gone">("ask");
  const [error, setError] = useState<string | null>(null);

  async function choose(enable: boolean) {
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/profile/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enable ? { emailNotifications: true } : { dismissEmailPrompt: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setState(enable ? "yes" : "gone");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setState("ask");
    }
  }

  if (state === "gone") return null;

  if (state === "yes") {
    return (
      <div className="font-ui border border-accent px-4 py-3 text-sm">
        <p className="text-ink">Email notifications are on. We just sent a welcome email.</p>
        <p className="mt-1 text-muted">{SPAM_TIP}</p>
        <button type="button" className="mt-2 text-xs text-accent underline" onClick={() => setState("gone")}>
          Got it
        </button>
      </div>
    );
  }

  return (
    <div className="font-ui border border-line bg-paper-deep/40 px-4 py-3 text-sm">
      <p className="text-ink">
        {audience === "author"
          ? "Want email reminders? We'll email you about your account, Studio time running low, and reader activity."
          : "Want email updates? We'll email you reading reminders and new books from authors you follow."}
      </p>
      <p className="mt-1 text-xs text-muted">You can change this anytime in Settings.</p>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          disabled={state === "busy"}
          className="bg-accent px-3 py-1.5 text-xs text-paper disabled:opacity-60"
          onClick={() => void choose(true)}
        >
          Yes, email me
        </button>
        <button
          type="button"
          disabled={state === "busy"}
          className="text-xs text-muted hover:underline"
          onClick={() => void choose(false)}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

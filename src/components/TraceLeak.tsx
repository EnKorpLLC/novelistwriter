"use client";

import { useState } from "react";

type Reader = { kind: string; name: string; email: string };

/** Paste a passage found online to see which reader's copy it came from. */
export function TraceLeak({ projectId }: { projectId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ found: boolean; readers: Reader[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/trace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't check");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-accent">Found your book shared somewhere? Trace it</summary>
      <p className="mt-2 text-xs text-muted">
        Copy a passage from where you found it (a few paragraphs works best) and paste it here. Quotes copied from the reader and downloaded
        copies carry a hidden code for the reader they were made for. Retyped text and screenshots don&apos;t, though the reader&apos;s name
        shows faintly behind the text in screenshots.
      </p>
      <textarea
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        className="mt-2 w-full border border-line bg-paper p-2 text-sm"
        placeholder="Paste the passage here"
      />
      <button type="button" disabled={busy || !text.trim()} onClick={() => void check()} className="mt-2 border border-line px-3 py-1.5 disabled:opacity-50">
        {busy ? "Checking…" : "Check"}
      </button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {result &&
        (result.readers.length ? (
          <ul className="mt-2 space-y-1">
            {result.readers.map((r) => (
              <li key={`${r.kind}-${r.email}`} className="text-ink">
                {r.kind}: {r.name ? `${r.name} · ` : ""}
                {r.email}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted">
            {result.found
              ? "There's a code in it, but it doesn't match a reader of this book."
              : "No hidden code in that text. It may have been retyped, or pasted somewhere that strips hidden characters."}
          </p>
        ))}
    </details>
  );
}

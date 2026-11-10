"use client";

import { useState } from "react";

export type Snippet = { id: string; label: string; hint?: string; code: string };

/** Copy-paste code for other sites, one tab per place it goes. */
export function EmbedSnippets({ snippets }: { snippets: Snippet[] }) {
  const [active, setActive] = useState(snippets[0]?.id);
  const [copied, setCopied] = useState(false);
  const current = snippets.find((s) => s.id === active) || snippets[0];
  if (!current) return null;
  return (
    <div className="font-ui text-sm">
      <div className="flex flex-wrap gap-1 text-xs">
        {snippets.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setActive(s.id);
              setCopied(false);
            }}
            className={`border px-2 py-1 ${s.id === current.id ? "border-accent text-ink" : "border-line text-muted hover:text-ink"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {current.hint && <p className="mt-2 text-xs text-muted">{current.hint}</p>}
      <div className="mt-2 flex items-start gap-2">
        <textarea readOnly value={current.code} rows={Math.min(6, current.code.split("\n").length + 1)} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 border border-line bg-paper-deep/40 px-2 py-1.5 font-mono text-xs" />
        <button
          type="button"
          className="shrink-0 border border-line px-3 py-1.5 text-xs"
          onClick={() =>
            void navigator.clipboard
              .writeText(current.code)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

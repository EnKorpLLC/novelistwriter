"use client";

import { useEffect, useState } from "react";

const LABEL = { purchase: "Bought here", arc: "Advance reader (free copy)", beta: "Beta reader (read an early draft, free)" } as const;
type Source = keyof typeof LABEL;

/**
 * Rate and review a book publicly, for readers who bought it here or read it as an advance or beta reader. Shows nothing
 * to anyone else. ARC and beta readers see that it's their choice to show it, and how it'll be labeled.
 */
export function ReviewForm({ projectId, presetBody, heading = "Rate and review this book" }: { projectId: string; presetBody?: string; heading?: string }) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [stars, setStars] = useState(5);
  const [body, setBody] = useState(presetBody || "");
  const [had, setHad] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/reviews?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => {
        setSources(d.sources || []);
        if (d.mine) {
          setStars(d.mine.stars);
          setBody(d.mine.body || presetBody || "");
          setHad(true);
        }
      })
      .catch(() => setSources([]));
  }, [projectId, presetBody]);

  if (!sources?.length) return null;
  const source = sources[0];
  if (state === "done") return <p className="font-ui text-sm text-accent">✓ Your review is on the book&apos;s page. Thank you.</p>;
  return (
    <form
      className="font-ui space-y-2 border border-line p-4 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        const r = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, stars, body, source }) }).catch(() => null);
        const d = r ? await r.json().catch(() => ({})) : {};
        if (r?.ok) setState("done");
        else {
          setError(d.error || "That didn't save. Try again.");
          setState("idle");
        }
      }}
    >
      <p className="font-display text-lg">{had ? "Your review" : heading}</p>
      <div className="flex gap-1 text-2xl" role="radiogroup" aria-label="Stars">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={stars === i} aria-label={`${i} star${i === 1 ? "" : "s"}`} className={i <= stars ? "text-accent" : "text-line"} onClick={() => setStars(i)}>
            ★
          </button>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What did you think? (optional)" className="block w-full border border-line bg-paper px-2 py-1.5" />
      <p className="text-xs text-muted">
        {source === "purchase"
          ? "Shows on the book's page with your name, marked “Bought here.”"
          : `Only if you choose to: it shows on the book's page with your name, marked “${LABEL[source]}.” Your review elsewhere is up to you.`}
      </p>
      <button type="submit" disabled={state === "busy"} className="bg-accent px-4 py-2 text-paper disabled:opacity-60">
        {state === "busy" ? "Saving…" : had ? "Update my review" : source === "purchase" ? "Post my review" : "Show my review on the book's page"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

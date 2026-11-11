"use client";

import { useState } from "react";
import { ReviewForm } from "@/components/ReviewForm";

type Review = { id: string; name: string; source: "purchase" | "arc" | "beta"; stars: number; body: string; reply: string | null; at: string; mine?: boolean };
const LABEL = { purchase: "Bought here", arc: "Advance reader (free copy)", beta: "Beta reader (read an early draft, free)" } as const;
const stars = (n: number) => `${"★".repeat(n)}${"☆".repeat(5 - n)}`;

/** Reader reviews on a launch page, with the author's one reply each; the admin can hide one that breaks the rules. */
export function BookReviews({
  projectId,
  authorName,
  avg,
  count,
  reviews,
  isOwner,
  isAdmin,
}: {
  projectId: string;
  authorName: string;
  avg: number | null;
  count: number;
  reviews: Review[];
  isOwner: boolean;
  isAdmin: boolean;
}) {
  const [list, setList] = useState(reviews);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function act(id: string, action: string, body?: string) {
    setMsg(null);
    const r = await fetch("/api/reviews", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error || "That didn't work.");
    if (action === "reply") setList((l) => l.map((x) => (x.id === id ? { ...x, reply: body || "" } : x)));
    if (action === "hide" || action === "delete") setList((l) => l.filter((x) => x.id !== id));
  }

  return (
    <section className="font-ui mt-12 border-t border-line pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl">Reader reviews</h2>
        {count > 0 && avg != null && (
          <p className="text-sm">
            <span className="text-accent">{stars(Math.round(avg))}</span> {avg.toFixed(1)} from {count} {count === 1 ? "reader" : "readers"}
          </p>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">From readers who bought it here, or read it free as an advance or beta reader (each review says which). The author can&apos;t remove them.</p>
      {!isOwner && (
        <div className="mt-4">
          <ReviewForm projectId={projectId} />
        </div>
      )}
      {list.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No reviews yet.</p>
      ) : (
        <ul className="mt-4 space-y-5 text-sm">
          {list.map((r) => (
            <li key={r.id} className="border-t border-line pt-3">
              <p>
                <span className="text-accent">{stars(r.stars)}</span> <span className="text-ink">{r.name}</span>{" "}
                <span className="text-xs text-muted">
                  · {LABEL[r.source]} · {new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </p>
              {r.body && <p className="mt-1 whitespace-pre-wrap">{r.body}</p>}
              {r.reply && (
                <p className="mt-2 border-l-2 border-line pl-3 text-muted">
                  <span className="text-ink">{authorName}:</span> {r.reply}
                </p>
              )}
              {isOwner && !r.reply && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={replies[r.id] || ""}
                    onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })}
                    placeholder="Reply publicly (once)"
                    className="min-w-0 flex-1 border border-line bg-paper px-2 py-1 text-xs"
                  />
                  <button type="button" disabled={!replies[r.id]?.trim()} className="border border-line px-3 py-1 text-xs disabled:opacity-50" onClick={() => void act(r.id, "reply", replies[r.id])}>
                    Reply
                  </button>
                </div>
              )}
              <p className="mt-1 flex gap-3 text-[11px]">
                {r.mine && (
                  <button type="button" className="text-muted underline" onClick={() => window.confirm("Delete your review?") && void act(r.id, "delete")}>
                    Delete my review
                  </button>
                )}
                {isAdmin && (
                  <button type="button" className="text-danger underline" onClick={() => window.confirm("Hide this review for breaking the rules?") && void act(r.id, "hide")}>
                    Hide (admin)
                  </button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
    </section>
  );
}

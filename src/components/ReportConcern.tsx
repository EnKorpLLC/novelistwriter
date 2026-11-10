"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

const BOOK_REASONS = [
  { id: "ai", kind: "ai_concern", label: "I don't think the author wrote this book themselves" },
  { id: "copied", kind: "content", label: "It's copied from someone else's work" },
  { id: "harmful", kind: "content", label: "Hateful or harmful content without warning" },
  { id: "other", kind: "content", label: "Something else" },
] as const;

const AUTHOR_REASONS = [
  { id: "hostile", kind: "conduct", label: "The author was rude or hostile about my feedback" },
  { id: "messages", kind: "conduct", label: "Unwanted or repeated messages" },
  { id: "inappropriate", kind: "conduct", label: "Asked me for something inappropriate" },
  { id: "other", kind: "conduct", label: "Something else" },
] as const;

/**
 * Private reports to Novelist Writer (RX1, RX4). Books are never publicly flagged; authors never see who reported.
 * mode="author" adds conduct reasons and a block option for readers.
 */
export function ReportConcern({
  projectId,
  authorUserId,
  mode = "book",
  className = "",
}: {
  projectId?: string;
  authorUserId?: string;
  mode?: "book" | "author";
  className?: string;
}) {
  const reasons = mode === "author" ? AUTHOR_REASONS : BOOK_REASONS;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(reasons[0].id);
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [block, setBlock] = useState(mode === "author");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const r = reasons.find((x) => x.id === reason)!;
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: r.kind, reason: r.label, details, projectId, targetUserId: authorUserId, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not send");
      if (block && authorUserId) {
        await fetch("/api/reader/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorUserId }) });
      }
      setDone(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`font-ui text-xs text-muted underline hover:text-ink ${className}`}>
        {mode === "author" ? "Report or block this author" : "Report a concern"}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[130] flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
            <div role="dialog" aria-label="Report a concern" className="font-ui w-full max-w-md border border-line bg-paper p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
              {done ? (
                <>
                  <h3 className="font-display text-xl">Thank you</h3>
                  <p className="mt-2 text-sm text-muted">
                    We&apos;ll look into it. {mode === "author" && block ? "You've blocked this author: their books are gone from your catalog, and they can't invite or message you. " : ""}
                    Reports are private, and nobody is told who sent one.
                  </p>
                  <button type="button" className="mt-4 border border-line px-4 py-2 text-sm" onClick={() => setOpen(false)}>
                    Close
                  </button>
                </>
              ) : (
                <>
                  <h3 className="font-display text-xl">{mode === "author" ? "Report or block this author" : "Report a concern"}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {mode === "author"
                      ? "Only Novelist Writer sees this. The author is never told who reported them."
                      : "Only Novelist Writer sees this. We never flag a book publicly; we check its writing record and look into it privately."}
                  </p>
                  <fieldset className="mt-3 space-y-1.5 text-sm">
                    {reasons.map((r) => (
                      <label key={r.id} className="flex items-start gap-2">
                        <input type="radio" name="reason" className="mt-1" checked={reason === r.id} onChange={() => setReason(r.id)} />
                        {r.label}
                      </label>
                    ))}
                  </fieldset>
                  <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What happened? (optional)" className="mt-3 w-full border border-line p-2 text-sm" />
                  {mode === "book" && (
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email, if you'd like a reply (optional)" className="mt-2 w-full border border-line p-2 text-sm" />
                  )}
                  {mode === "author" && authorUserId && (
                    <label className="mt-3 flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={block} onChange={(e) => setBlock(e.target.checked)} />
                      <span>
                        Also block this author
                        <span className="block text-xs text-muted">Their books leave your catalog, and they can&apos;t invite or message you. You can unblock anytime.</span>
                      </span>
                    </label>
                  )}
                  {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" className="border border-line px-3 py-2 text-sm" onClick={() => setOpen(false)}>
                      Cancel
                    </button>
                    <button type="button" disabled={busy} className="bg-accent px-3 py-2 text-sm text-paper disabled:opacity-50" onClick={() => void send()}>
                      {busy ? "Sending…" : "Send report"}
                    </button>
                  </div>
                  <p className="mt-3 text-[11px] text-muted">
                    See the{" "}
                    <a href="/conduct" className="underline">
                      conduct rules
                    </a>
                    .
                  </p>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

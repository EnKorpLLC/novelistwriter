"use client";

import { useCallback, useEffect, useState } from "react";
import { reactionGlyph } from "@/lib/beta-platform";

type Reply = { id: string; body: string; createdAt: string; fromAuthor: boolean; name: string };
type Comment = {
  id: string;
  excerpt: string | null;
  body: string;
  readerName: string;
  createdAt: string;
  completed: boolean;
  reactions: { emoji: string; count: number }[];
  replies: Reply[];
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Beta readers' comments on the open chapter, beside the editor. */
export function ChapterFeedbackPanel({
  projectId,
  chapterId,
  onHighlight,
  onOpenAll,
}: {
  projectId: string;
  chapterId: string | null;
  onHighlight: (excerpt: string) => void;
  onOpenAll: () => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [openReplies, setOpenReplies] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!chapterId) return;
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/feedback?chapterId=${encodeURIComponent(chapterId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load feedback");
      setComments(json.comments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load feedback");
    }
  }, [projectId, chapterId]);

  useEffect(() => {
    setComments(null);
    void load();
  }, [load]);

  async function setResolved(c: Comment, completed: boolean) {
    setBusyId(c.id);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/beta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: c.id, action: completed ? "complete" : "uncomplete" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update");
      setComments((list) => (list || []).map((x) => (x.id === c.id ? { ...x, completed } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  async function reply(c: Comment) {
    const text = (drafts[c.id] || "").trim();
    if (!text) return;
    setBusyId(c.id);
    setError(null);
    try {
      const res = await fetch("/api/beta/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", parentId: c.id, projectId, text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not reply");
      setDrafts((d) => ({ ...d, [c.id]: "" }));
      await load();
      setOpenReplies((s) => new Set(s).add(c.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reply");
    } finally {
      setBusyId(null);
    }
  }

  const list = (comments || []).filter((c) => showResolved || !c.completed);
  const openCount = (comments || []).filter((c) => !c.completed).length;

  return (
    <aside className="font-ui flex h-full min-h-0 flex-col border-l border-line bg-paper-deep/40">
      <div className="shrink-0 border-b border-line px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-ink">Reader feedback</p>
          <button type="button" className="text-[11px] text-accent hover:underline" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <p className="text-[11px] text-muted">
          {comments == null
            ? "Loading…"
            : `${openCount} open · ${comments.length - openCount} resolved on this chapter`}
        </p>
        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error && <p className="mb-2 text-xs text-danger">{error}</p>}
        {!chapterId && <p className="text-xs text-muted">Pick a chapter to see its comments.</p>}
        {comments && list.length === 0 && (
          <p className="text-xs text-muted">
            {comments.length ? "Everything on this chapter is resolved." : "No reader comments on this chapter yet."}
          </p>
        )}
        <ul className="space-y-3">
          {list.map((c) => {
            const repliesOpen = openReplies.has(c.id);
            return (
              <li key={c.id} className={`border border-line bg-paper p-2.5 text-xs ${c.completed ? "opacity-60" : ""}`}>
                {c.excerpt && (
                  <button
                    type="button"
                    className="mb-1.5 block w-full border-l-2 border-accent/60 pl-2 text-left italic text-muted hover:text-ink"
                    title="Highlight this passage in the chapter"
                    onClick={() => onHighlight(c.excerpt!)}
                  >
                    “{c.excerpt.length > 160 ? `${c.excerpt.slice(0, 160)}…` : c.excerpt}”
                  </button>
                )}
                <p className="whitespace-pre-wrap text-sm text-ink">{c.body}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {c.readerName} · {shortDate(c.createdAt)}
                  {c.reactions.length > 0 && (
                    <> · {c.reactions.map((r) => `${reactionGlyph(r.emoji)} ${r.count}`).join(" ")}</>
                  )}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    className="text-accent hover:underline disabled:opacity-50"
                    onClick={() => void setResolved(c, !c.completed)}
                  >
                    {c.completed ? "Reopen" : "Resolve"}
                  </button>
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() =>
                      setOpenReplies((s) => {
                        const next = new Set(s);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                  >
                    {repliesOpen ? "Hide replies" : c.replies.length ? `Replies (${c.replies.length})` : "Reply"}
                  </button>
                </div>
                {repliesOpen && (
                  <div className="mt-2 space-y-1.5 border-t border-line pt-2">
                    {c.replies.map((r) => (
                      <p key={r.id} className="text-[11px]">
                        <span className="text-ink">{r.fromAuthor ? "You" : r.name}:</span>{" "}
                        <span className="whitespace-pre-wrap text-muted">{r.body}</span>
                      </p>
                    ))}
                    <textarea
                      rows={2}
                      className="w-full border border-line bg-paper px-2 py-1 text-xs"
                      placeholder="Reply to the reader"
                      value={drafts[c.id] || ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      disabled={busyId === c.id || !(drafts[c.id] || "").trim()}
                      className="bg-accent px-2 py-1 text-[11px] text-paper disabled:opacity-40"
                      onClick={() => void reply(c)}
                    >
                      Send reply
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="shrink-0 border-t border-line px-3 py-2 text-[11px]">
        <button type="button" className="text-accent hover:underline" onClick={onOpenAll}>
          All feedback, reviews, and export in the Beta tab →
        </button>
      </div>
    </aside>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { Chapter } from "@/lib/types";

type Invite = {
  id: string;
  email: string;
  status: string;
  link: string | null;
  created_at: string;
};

type Comment = {
  id: string;
  body: string;
  excerpt: string | null;
  chapterId: string | null;
  chapterTitle: string | null;
  chapterOrder: number;
  readerEmail: string | null;
  createdAt: string;
};

type Props = {
  projectId: string;
  chapters: Chapter[];
};

const GENERAL = "__general__";

export function BetaPanel({ projectId, chapters }: Props) {
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [applyLink, setApplyLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [activeChapter, setActiveChapter] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/beta`);
      const data = await res.json();
      if (res.ok) {
        setInvites(data.invites || []);
        setComments(data.comments || []);
        setApplyLink(data.applyLink || "");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const requests = invites.filter((i) => i.status === "requested");
  const readers = invites.filter(
    (i) => i.status === "pending" || i.status === "accepted"
  );
  const closed = invites.filter((i) => i.status === "denied" || i.status === "revoked");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of comments) {
      const key = c.chapterId || GENERAL;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [comments]);

  const chapterNav = useMemo(() => {
    const rows: { id: string; title: string; count: number }[] = chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      count: counts.get(ch.id) || 0,
    }));
    const generalCount = counts.get(GENERAL) || 0;
    if (generalCount) {
      rows.unshift({ id: GENERAL, title: "General", count: generalCount });
    }
    return rows;
  }, [chapters, counts]);

  useEffect(() => {
    if (activeChapter) return;
    const firstWithComments = chapterNav.find((c) => c.count > 0);
    setActiveChapter(firstWithComments?.id || chapterNav[0]?.id || null);
  }, [chapterNav, activeChapter]);

  const chapterComments = comments
    .filter((c) => (c.chapterId || GENERAL) === activeChapter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  async function invite() {
    const res = await fetch(`/api/projects/${projectId}/beta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNote(data.error || "Invite failed");
      return;
    }
    setEmail("");
    if (data.link) {
      try {
        await navigator.clipboard.writeText(data.link);
        setNote("Invite created. Reading link copied.");
      } catch {
        setNote(`Invite created. Share: ${data.link}`);
      }
    }
    void load();
  }

  async function act(inviteId: string, action: "approve" | "deny" | "remove") {
    const res = await fetch(`/api/projects/${projectId}/beta`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId, action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNote(data.error || "Update failed");
      return;
    }
    if (action === "approve" && data.link) {
      try {
        await navigator.clipboard.writeText(data.link);
        setNote("Approved. Reading link copied — send it to them.");
      } catch {
        setNote(`Approved. Share: ${data.link}`);
      }
    } else if (action === "deny") {
      setNote("Request denied.");
    } else {
      setNote("Reader removed. Their link no longer works.");
    }
    void load();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-8">
          <div>
            <h2 className="font-display text-2xl">Beta readers</h2>
            <p className="mt-1 text-sm text-muted">
              Invite people, share an apply link, approve requests, and read comments by chapter.
            </p>
          </div>

          <section className="font-ui grid gap-4 border border-line p-4 md:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Invite by email</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  className="min-w-[10rem] flex-1 border border-line px-3 py-2 text-sm"
                  placeholder="reader@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button type="button" onClick={() => void invite()} className="bg-accent px-4 py-2 text-paper">
                  Invite
                </button>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Application link</p>
              <p className="mt-1 text-xs text-muted">
                Share this if people should request access first.
              </p>
              <button
                type="button"
                className="mt-2 border border-line px-3 py-2 text-xs text-accent hover:border-accent"
                onClick={() => {
                  if (!applyLink) return;
                  void navigator.clipboard.writeText(applyLink);
                  setNote("Application link copied.");
                }}
              >
                Copy apply link
              </button>
            </div>
            {note && <p className="text-sm text-accent md:col-span-2">{note}</p>}
          </section>

          {requests.length > 0 && (
            <section>
              <h3 className="font-display text-xl">Requests</h3>
              <p className="mt-1 text-sm text-muted">Approve to send them a reading link, or deny.</p>
              <ul className="font-ui mt-3 space-y-2">
                {requests.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-accent/40 bg-accent/5 px-3 py-2"
                  >
                    <span className="text-sm">
                      {inv.email}
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">
                        requested
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className="bg-accent px-3 py-1 text-xs text-paper"
                        onClick={() => void act(inv.id, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="border border-line px-3 py-1 text-xs text-danger"
                        onClick={() => void act(inv.id, "deny")}
                      >
                        Deny
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="font-display text-xl">Readers</h3>
            {loading && readers.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Loading…</p>
            ) : readers.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No active readers yet.</p>
            ) : (
              <ul className="font-ui mt-3 space-y-2">
                {readers.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-line px-3 py-2"
                  >
                    <span className="text-sm">
                      {inv.email}{" "}
                      <span className="text-[10px] uppercase tracking-wide text-muted">
                        {inv.status === "accepted" ? "reading" : "invited"}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      {inv.link && (
                        <button
                          type="button"
                          className="text-xs text-accent hover:underline"
                          onClick={() => {
                            void navigator.clipboard.writeText(inv.link!);
                            setNote("Reading link copied.");
                          }}
                        >
                          Copy link
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-xs text-danger hover:underline"
                        onClick={() => {
                          if (confirm(`Remove ${inv.email}? Their link will stop working.`)) {
                            void act(inv.id, "remove");
                          }
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {closed.length > 0 && (
              <p className="mt-3 text-[11px] text-muted">
                {closed.filter((i) => i.status === "denied").length} denied ·{" "}
                {closed.filter((i) => i.status === "revoked").length} removed
              </p>
            )}
          </section>

          <section>
            <h3 className="font-display text-xl">Comments</h3>
            <p className="mt-1 text-sm text-muted">
              {comments.length} total. Pick a chapter — you only see that chapter’s notes.
            </p>
            <div className="mt-4 flex min-h-[20rem] flex-col overflow-hidden border border-line md:flex-row">
              <nav className="max-h-56 shrink-0 overflow-y-auto border-b border-line md:max-h-none md:w-52 md:border-b-0 md:border-r">
                {chapterNav.length === 0 ? (
                  <p className="p-3 text-sm text-muted">No chapters.</p>
                ) : (
                  <ul className="font-ui">
                    {chapterNav.map((ch) => (
                      <li key={ch.id}>
                        <button
                          type="button"
                          onClick={() => setActiveChapter(ch.id)}
                          className={`flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm ${
                            activeChapter === ch.id
                              ? "bg-accent/15 text-ink"
                              : "text-muted hover:bg-paper-deep/50"
                          }`}
                        >
                          <span className="truncate">{ch.title}</span>
                          <span className="shrink-0 text-[10px]">{ch.count}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </nav>
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3">
                {chapterComments.length === 0 ? (
                  <p className="text-sm text-muted">No comments on this chapter.</p>
                ) : (
                  <ul className="space-y-3">
                    {chapterComments.map((c) => (
                      <li key={c.id} className="border border-line bg-paper-deep/30 px-3 py-3">
                        <div className="font-ui flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted">
                          <span>{c.readerEmail || "Reader"}</span>
                          <time dateTime={c.createdAt}>
                            {new Date(c.createdAt).toLocaleString()}
                          </time>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                          {c.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

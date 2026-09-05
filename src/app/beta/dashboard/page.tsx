"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import { DashboardRoleNav } from "@/components/DashboardRoleNav";
import { rememberSide, type ProfileRoles } from "@/lib/beta-platform";

type ShelfBook = {
  inviteId: string;
  projectId: string;
  status: string;
  lastReadAt: string | null;
  currentChapterId: string | null;
  finishedAt: string | null;
  title: string;
  genre: string;
  authorName: string;
  coverUrl: string | null;
};

type CatalogGenre = {
  genre: string;
  books: {
    projectId: string;
    title: string;
    genre: string;
    authorUserId?: string;
    authorName: string;
    coverUrl: string | null;
  }[];
};

type Thread = {
  id: string;
  body: string;
  excerpt: string | null;
  completed: boolean;
  createdAt: string;
  projectId: string;
  projectTitle: string;
  chapterId: string | null;
  chapterTitle: string | null;
  openUrl: string;
  reactions: { emoji: string; count: number }[];
  replies: {
    id: string;
    body: string;
    createdAt: string;
    fromAuthor: boolean;
    fromReader: boolean;
  }[];
};

type DashStats = { finished: number; dnf: number; reading: number };

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

type ReceivedReview = {
  id: string;
  rating: number | null;
  body: string;
  createdAt: string;
  authorName: string;
  projectTitle: string | null;
};

type ConversationItem = {
  id: string;
  readerEmail: string;
  projectId: string | null;
  lastMessageAt: string | null;
  otherName: string;
  role: "author" | "reader";
};

type ThreadMessage = {
  id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
};

type FollowItem = {
  id: string;
  authorUserId: string;
  authorName: string;
  createdAt: string;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function BetaDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<ProfileRoles>({ is_author: true, is_beta_reader: true });
  const [stats, setStats] = useState<DashStats>({ finished: 0, dnf: 0, reading: 0 });
  const [shelf, setShelf] = useState<ShelfBook[]>([]);
  const [catalog, setCatalog] = useState<CatalogGenre[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [hubOpen, setHubOpen] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [reviews, setReviews] = useState<ReceivedReview[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [activeConvo, setActiveConvo] = useState<{
    author_user_id: string;
    reader_user_id: string | null;
  } | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [follows, setFollows] = useState<FollowItem[]>([]);
  const [followBusy, setFollowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        rememberSide("beta");
      } catch {
        /* ignore */
      }
      const [dashRes, commentsRes, notifRes, reviewsRes, messagesRes, followsRes] =
        await Promise.all([
          fetch("/api/beta/dashboard"),
          fetch("/api/beta/comments?scope=mine"),
          fetch("/api/beta/notifications"),
          fetch("/api/beta/reader-reviews?mine=1"),
          fetch("/api/beta/messages"),
          fetch("/api/beta/follows"),
        ]);
      const dash = await dashRes.json();
      const comments = await commentsRes.json();
      if (!dashRes.ok) throw new Error(dash.error || "Failed to load dashboard");
      setRoles(dash.roles || { is_author: false, is_beta_reader: true });
      setStats(dash.stats || { finished: 0, dnf: 0, reading: 0 });
      setShelf(dash.shelf || []);
      setCatalog(dash.catalog || []);
      if (commentsRes.ok) setThreads(comments.threads || []);

      if (notifRes.ok) {
        const notif = await notifRes.json();
        setNotifications(notif.notifications || []);
        setUnreadCount(notif.unread || 0);
      }
      if (reviewsRes.ok) {
        const rev = await reviewsRes.json();
        setReviews(rev.reviews || []);
      }
      if (messagesRes.ok) {
        const msg = await messagesRes.json();
        setConversations(msg.conversations || []);
      }
      if (followsRes.ok) {
        const fol = await followsRes.json();
        setFollows(fol.follows || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendReply(threadId: string, projectId: string) {
    const text = (replyDraft[threadId] || "").trim();
    if (!text) return;
    const res = await fetch("/api/beta/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reply", parentId: threadId, projectId, text }),
    });
    if (res.ok) {
      setReplyDraft((d) => ({ ...d, [threadId]: "" }));
      void load();
    }
  }

  async function markNotificationsRead(opts: { ids?: string[]; all?: boolean }) {
    const res = await fetch("/api/beta/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok) return;
    if (opts.all) {
      setNotifications((list) =>
        list.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } else if (opts.ids?.length) {
      const idSet = new Set(opts.ids);
      setNotifications((list) =>
        list.map((n) =>
          idSet.has(n.id) && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount((c) => Math.max(0, c - opts.ids!.length));
    }
  }

  async function openConversation(id: string) {
    setActiveConvoId(id);
    setMessageDraft("");
    const res = await fetch(`/api/beta/messages?conversationId=${encodeURIComponent(id)}`);
    const json = await res.json();
    if (!res.ok) return;
    setActiveConvo(json.conversation || null);
    setThreadMessages(json.messages || []);
  }

  async function sendMessage() {
    if (!activeConvoId) return;
    const text = messageDraft.trim();
    if (!text) return;
    const res = await fetch("/api/beta/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: activeConvoId, text }),
    });
    if (res.ok) {
      setMessageDraft("");
      await openConversation(activeConvoId);
    }
  }

  async function setFollow(authorUserId: string, action: "follow" | "unfollow") {
    setFollowBusy(authorUserId);
    try {
      const res = await fetch("/api/beta/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorUserId, action }),
      });
      if (!res.ok) return;
      if (action === "unfollow") {
        setFollows((list) => list.filter((f) => f.authorUserId !== authorUserId));
      } else {
        const folRes = await fetch("/api/beta/follows");
        if (folRes.ok) {
          const fol = await folRes.json();
          setFollows(fol.follows || []);
        }
      }
    } finally {
      setFollowBusy(null);
    }
  }

  const followingIds = new Set(follows.map((f) => f.authorUserId));
  const activeRole = conversations.find((c) => c.id === activeConvoId)?.role;
  const myUserId =
    activeConvo && activeRole === "author"
      ? activeConvo.author_user_id
      : activeConvo?.reader_user_id || null;

  return (
    <div className="min-h-screen">
      <header className="font-ui flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
        <Link href="/beta/dashboard" className="font-display text-xl">
          Novelist Writer · Beta
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <DashboardRoleNav roles={roles} side="beta" />
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-3xl">Beta reader dashboard</h1>
        <p className="mt-1 text-sm text-muted">Your shelf and books open for beta across the platform.</p>

        {loading && <p className="mt-8 text-sm text-muted">Loading…</p>}
        {error && <p className="mt-8 text-sm text-danger">{error}</p>}

        {!loading && !error && (
          <>
            <div className="mt-8 flex flex-wrap gap-6 border border-line px-5 py-4 font-ui text-sm">
              <span>
                <span className="text-muted">Finished</span>{" "}
                <span className="text-ink">{stats.finished}</span>
              </span>
              <span>
                <span className="text-muted">DNF</span>{" "}
                <span className="text-ink">{stats.dnf}</span>
              </span>
              <span>
                <span className="text-muted">Reading</span>{" "}
                <span className="text-ink">{stats.reading}</span>
              </span>
            </div>

            <section id="notifications" className="mt-12">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-2xl">
                  Notifications
                  {unreadCount > 0 && (
                    <span className="ml-2 font-ui text-sm text-accent">
                      {unreadCount} unread
                    </span>
                  )}
                </h2>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="font-ui text-xs text-accent underline"
                    onClick={() => void markNotificationsRead({ all: true })}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No notifications yet.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {notifications.map((n) => {
                    const content = (
                      <>
                        <p className={`text-sm ${n.readAt ? "text-muted" : "text-ink"}`}>
                          {n.title}
                        </p>
                        {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                        <p className="mt-1 text-[10px] text-muted">{formatDate(n.createdAt)}</p>
                      </>
                    );
                    const className = `block border border-line px-4 py-3 ${
                      n.readAt ? "" : "border-accent/40"
                    }`;
                    if (n.href) {
                      return (
                        <li key={n.id}>
                          <Link
                            href={n.href}
                            className={className}
                            onClick={() => {
                              if (!n.readAt) void markNotificationsRead({ ids: [n.id] });
                            }}
                          >
                            {content}
                          </Link>
                        </li>
                      );
                    }
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={`${className} w-full text-left`}
                          onClick={() => {
                            if (!n.readAt) void markNotificationsRead({ ids: [n.id] });
                          }}
                        >
                          {content}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section id="reviews" className="mt-12">
              <h2 className="font-display text-2xl">Reviews I&apos;ve received</h2>
              {reviews.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No author reviews of your reading yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {reviews.map((r) => (
                    <li key={r.id} className="border border-line px-4 py-3">
                      <p className="text-xs text-muted">
                        {r.authorName}
                        {r.projectTitle ? ` · ${r.projectTitle}` : ""}
                        {r.rating != null ? ` · ${r.rating}/5` : ""}
                        {" · "}
                        {formatDate(r.createdAt)}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{r.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section id="messages" className="mt-12">
              <h2 className="font-display text-2xl">Messages</h2>
              {conversations.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No conversations yet.</p>
              ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <ul className="space-y-2">
                    {conversations.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`w-full border px-4 py-3 text-left ${
                            activeConvoId === c.id ? "border-accent" : "border-line"
                          }`}
                          onClick={() => void openConversation(c.id)}
                        >
                          <span className="font-display text-lg">{c.otherName}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {c.role === "author" ? "You (author)" : "You (reader)"}
                            {c.lastMessageAt ? ` · ${formatDate(c.lastMessageAt)}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="border border-line p-4">
                    {!activeConvoId ? (
                      <p className="text-sm text-muted">Select a conversation.</p>
                    ) : (
                      <>
                        <ul className="max-h-64 space-y-3 overflow-y-auto">
                          {threadMessages.length === 0 && (
                            <li className="text-sm text-muted">No messages yet.</li>
                          )}
                          {threadMessages.map((m) => (
                            <li key={m.id} className="text-sm">
                              <span className="text-xs text-muted">
                                {myUserId && m.sender_user_id === myUserId ? "You" : "Them"} ·{" "}
                                {formatDate(m.created_at)}
                              </span>
                              <p className="mt-0.5 whitespace-pre-wrap text-ink">{m.body}</p>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <input
                            className="min-w-[12rem] flex-1 border border-line px-2 py-1.5 text-sm"
                            placeholder="Reply…"
                            value={messageDraft}
                            onChange={(e) => setMessageDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void sendMessage();
                            }}
                          />
                          <button
                            type="button"
                            className="border border-line px-3 py-1.5 text-xs text-accent"
                            onClick={() => void sendMessage()}
                          >
                            Send
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="mt-12">
              <h2 className="font-display text-2xl">Following</h2>
              {follows.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  You&apos;re not following any authors yet. Follow from the catalog or a book page.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {follows.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-4 border border-line px-4 py-3"
                    >
                      <span>
                        <span className="font-display text-lg">{f.authorName}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          Since {formatDate(f.createdAt)}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={followBusy === f.authorUserId}
                        className="font-ui shrink-0 border border-line px-3 py-1.5 text-xs text-accent disabled:opacity-60"
                        onClick={() => void setFollow(f.authorUserId, "unfollow")}
                      >
                        {followBusy === f.authorUserId ? "…" : "Unfollow"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-10">
              <h2 className="font-display text-2xl">My books</h2>
              {shelf.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  Nothing on your shelf yet. Browse available books below or open a share link.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {shelf.map((b) => (
                    <li
                      key={b.inviteId}
                      className="flex items-center justify-between gap-4 border border-line bg-paper px-5 py-4"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-4">
                        <div className="relative h-16 w-11 shrink-0 overflow-hidden border border-line bg-paper-deep">
                          {b.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.coverUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted">
                              —
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display text-xl">{b.title}</h3>
                          <p className="text-sm text-muted">
                            {b.authorName} · {b.genre}
                            {b.finishedAt ? " · Finished" : b.status === "dnf" ? " · DNF" : ""}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/beta/read/${b.projectId}`}
                        className="font-ui shrink-0 text-sm text-accent"
                      >
                        {b.finishedAt ? "Review" : "Continue"} →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-12">
              <h2 className="font-display text-2xl">Available by genre</h2>
              <p className="mt-1 text-sm text-muted">All manuscripts marked ready for beta readers.</p>
              {catalog.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No other ready books right now.</p>
              ) : (
                <div className="mt-6 space-y-8">
                  {catalog.map((g) => (
                    <div key={g.genre}>
                      <h3 className="font-ui text-xs uppercase tracking-wide text-muted">{g.genre}</h3>
                      <ul className="mt-3 space-y-2">
                        {g.books.map((b) => (
                          <li
                            key={b.projectId}
                            className="flex items-center justify-between gap-4 border border-line px-4 py-3 transition hover:border-accent"
                          >
                            <Link href={`/beta/book/${b.projectId}`} className="min-w-0 flex-1">
                              <span className="font-display text-lg">{b.title}</span>
                              <span className="mt-0.5 block text-sm text-muted">{b.authorName}</span>
                            </Link>
                            <div className="flex shrink-0 items-center gap-3">
                              {b.authorUserId && (
                                <button
                                  type="button"
                                  disabled={followBusy === b.authorUserId}
                                  className="font-ui border border-line px-3 py-1.5 text-xs text-accent disabled:opacity-60"
                                  onClick={() =>
                                    void setFollow(
                                      b.authorUserId!,
                                      followingIds.has(b.authorUserId!) ? "unfollow" : "follow"
                                    )
                                  }
                                >
                                  {followBusy === b.authorUserId
                                    ? "…"
                                    : followingIds.has(b.authorUserId)
                                      ? "Unfollow"
                                      : "Follow"}
                                </button>
                              )}
                              <Link
                                href={`/beta/book/${b.projectId}`}
                                className="font-ui text-sm text-accent"
                              >
                                View →
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-12 border border-line p-4">
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-3 text-left"
                onClick={() => setHubOpen((o) => !o)}
                aria-expanded={hubOpen}
              >
                <span>
                  <span className="font-display block text-xl text-ink">My comments</span>
                  <span className="mt-1 block text-xs text-muted">
                    {threads.length} thread{threads.length === 1 ? "" : "s"} across your books
                  </span>
                </span>
                <span className="shrink-0 text-xs text-accent">{hubOpen ? "Collapse" : "Expand"}</span>
              </button>
              {hubOpen && (
                <ul className="mt-4 space-y-4">
                  {threads.length === 0 && (
                    <li className="text-sm text-muted">No comments yet. Highlight text while reading to leave notes.</li>
                  )}
                  {threads.map((t) => (
                    <li key={t.id} className="border border-line p-3">
                      <p className="text-xs text-muted">
                        {t.projectTitle}
                        {t.chapterTitle ? ` · ${t.chapterTitle}` : ""}
                        {t.completed ? " · Completed" : ""}
                      </p>
                      {t.excerpt && (
                        <p className="mt-1 border-l-2 border-accent pl-2 text-xs italic text-muted">
                          “{t.excerpt}”
                        </p>
                      )}
                      <p className="mt-2 text-sm text-ink">{t.body}</p>
                      {t.reactions.length > 0 && (
                        <p className="mt-1 text-xs text-muted">
                          Reactions: {t.reactions.map((r) => `${r.emoji}×${r.count}`).join(" · ")}
                        </p>
                      )}
                      {t.replies.length > 0 && (
                        <ul className="mt-3 space-y-2 border-t border-line pt-3">
                          {t.replies.map((r) => (
                            <li key={r.id} className="text-sm">
                              <span className="text-xs text-muted">
                                {r.fromAuthor ? "Author" : "You"} ·{" "}
                              </span>
                              {r.body}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input
                          className="min-w-[12rem] flex-1 border border-line px-2 py-1.5 text-sm"
                          placeholder="Reply…"
                          value={replyDraft[t.id] || ""}
                          onChange={(e) =>
                            setReplyDraft((d) => ({ ...d, [t.id]: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="border border-line px-3 py-1.5 text-xs text-accent"
                          onClick={() => void sendReply(t.id, t.projectId)}
                        >
                          Reply
                        </button>
                        <Link href={t.openUrl} className="px-3 py-1.5 text-xs text-accent underline">
                          Open passage
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

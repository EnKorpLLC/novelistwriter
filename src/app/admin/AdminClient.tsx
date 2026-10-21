"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import { AdminModeration } from "./AdminModeration";
import { GiftForm } from "./GiftForm";
import { AdminMetrics } from "./AdminMetrics";

type Message = {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  userId: string | null;
  status: "new" | "read" | "archived";
  createdAt: string;
};

type AdminUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  isAuthor: boolean;
  isBetaReader: boolean;
  isPlatformAdmin: boolean;
  tier: string;
  passBankDays: number;
  passActiveUntil: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

const TABS = [
  { id: "metrics", label: "Metrics" },
  { id: "messages", label: "Messages" },
  { id: "users", label: "Users" },
  { id: "moderation", label: "Moderation" },
  { id: "gifts", label: "Studio days" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function when(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function AdminClient({ emailReady }: { emailReady: boolean }) {
  const [tab, setTab] = useState<TabId>("metrics");
  const [note, setNote] = useState<string | null>(null);

  const [filter, setFilter] = useState<"open" | "archived">("open");
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState(0);
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userBusy, setUserBusy] = useState<string | null>(null);
  const [tempShown, setTempShown] = useState<{ email: string; password: string } | null>(null);
  const [giftUserId, setGiftUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"author" | "reader">("author");
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);
  const [userTotal, setUserTotal] = useState(0);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/admin/messages?status=${filter}`);
    const data = await res.json();
    if (!res.ok) {
      setNote(data.error || "Could not load messages");
      return;
    }
    setMessages(data.messages || []);
    setUnread(data.unread || 0);
  }, [filter]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  async function setMessageStatus(id: string, status: Message["status"]) {
    const res = await fetch("/api/admin/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) void loadMessages();
  }

  async function openMessage(m: Message) {
    const next = openMessageId === m.id ? null : m.id;
    setOpenMessageId(next);
    if (next && m.status === "new") await setMessageStatus(m.id, "read");
  }

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        role: userRole,
        page: String(userPage),
        pageSize: String(userPageSize),
      });
      if (appliedQuery) params.set("email", appliedQuery);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Could not load accounts");
        return;
      }
      setUsers(data.users || []);
      setUserTotal(data.total || 0);
    } finally {
      setUsersLoading(false);
    }
  }, [userRole, userPage, userPageSize, appliedQuery]);

  useEffect(() => {
    if (tab === "users") void loadUsers();
  }, [tab, loadUsers]);

  function searchUsers(e?: React.FormEvent) {
    e?.preventDefault();
    setNote(null);
    setTempShown(null);
    setUserPage(1);
    setAppliedQuery(query.trim());
  }

  async function userAction(u: AdminUser, action: "send_reset" | "temp_password") {
    if (
      action === "temp_password" &&
      !window.confirm(
        `Set a temporary password for ${u.email}? Their current password stops working right away.`
      )
    ) {
      return;
    }
    setUserBusy(`${u.id}:${action}`);
    setNote(null);
    setTempShown(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (data.tempPassword) setTempShown({ email: data.email, password: data.tempPassword });
      else setNote(data.message || "Done.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Failed");
    } finally {
      setUserBusy(null);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="font-ui flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
        <Link href="/admin" className="font-display text-xl">
          Novelist Writer · Admin
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-accent hover:underline">
            Author dashboard
          </Link>
          <SignOutButton />
        </div>
      </header>

      <main className="font-ui mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-3xl">Admin</h1>
        {!emailReady && (
          <p className="mt-3 border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            Outgoing email isn&apos;t configured. Set SMTP_USER and SMTP_APP_PASSWORD in Vercel, then
            redeploy. Messages still land in this inbox.
          </p>
        )}

        <nav className="mt-8 flex flex-wrap gap-1 border-b border-line" aria-label="Admin sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`px-3 py-2.5 text-sm ${
                tab === t.id
                  ? "border-b-2 border-accent text-ink"
                  : "border-b-2 border-transparent text-muted hover:text-ink"
              }`}
              onClick={() => {
                setTab(t.id);
                setNote(null);
              }}
            >
              {t.label}
              {t.id === "messages" && unread > 0 && (
                <span className="ml-1.5 text-xs text-accent">{unread}</span>
              )}
            </button>
          ))}
        </nav>

        {note && <p className="mt-4 text-sm text-ink">{note}</p>}

        {tab === "messages" && (
          <section className="mt-6">
            <div className="flex gap-3 text-sm">
              {(["open", "archived"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={filter === f ? "text-ink underline" : "text-muted hover:text-ink"}
                  onClick={() => setFilter(f)}
                >
                  {f === "open" ? "Inbox" : "Archived"}
                </button>
              ))}
            </div>
            {messages.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No messages.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {messages.map((m) => {
                  const open = openMessageId === m.id;
                  return (
                    <li key={m.id} className="border border-line">
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-left"
                        onClick={() => void openMessage(m)}
                        aria-expanded={open}
                      >
                        <span className={m.status === "new" ? "font-medium text-ink" : "text-ink"}>
                          {m.subject || "(no subject)"}
                          <span className="ml-2 text-xs text-muted">
                            {m.name || m.email}
                            {m.userId ? " · has account" : ""}
                          </span>
                        </span>
                        <span className="text-xs text-muted">
                          {m.status === "new" ? "New · " : ""}
                          {when(m.createdAt)}
                        </span>
                      </button>
                      {open && (
                        <div className="border-t border-line px-4 py-3">
                          <p className="text-xs text-muted">{m.email}</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{m.body}</p>
                          <div className="mt-3 flex flex-wrap gap-3 text-sm">
                            <a
                              href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || "Your message"}`)}`}
                              className="text-accent hover:underline"
                            >
                              Reply by email
                            </a>
                            <button
                              type="button"
                              className="text-accent hover:underline"
                              onClick={() => {
                                setQuery(m.email);
                                setAppliedQuery(m.email);
                                setUserPage(1);
                                setTab("users");
                              }}
                            >
                              Look up account
                            </button>
                            {m.status !== "archived" ? (
                              <button
                                type="button"
                                className="text-muted hover:underline"
                                onClick={() => void setMessageStatus(m.id, "archived")}
                              >
                                Archive
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="text-muted hover:underline"
                                onClick={() => void setMessageStatus(m.id, "read")}
                              >
                                Move to inbox
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {tab === "users" && (
          <section className="mt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex gap-3">
                {(["author", "reader"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={userRole === r ? "text-ink underline" : "text-muted hover:text-ink"}
                    onClick={() => {
                      setUserRole(r);
                      setUserPage(1);
                      setGiftUserId(null);
                    }}
                  >
                    {r === "author" ? "Authors" : "Readers"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-muted">
                Per page
                <select
                  value={userPageSize}
                  onChange={(e) => {
                    setUserPageSize(Number(e.target.value));
                    setUserPage(1);
                  }}
                  className="border border-line bg-paper px-2 py-1 text-sm text-ink"
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <form onSubmit={(e) => searchUsers(e)} className="flex flex-wrap gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by email or name"
                className="min-w-[16rem] flex-1 border border-line bg-paper px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-accent px-4 py-2 text-sm text-paper">
                Search
              </button>
              {appliedQuery && (
                <button
                  type="button"
                  className="text-sm text-muted hover:underline"
                  onClick={() => {
                    setQuery("");
                    setAppliedQuery("");
                    setUserPage(1);
                  }}
                >
                  Clear
                </button>
              )}
            </form>
            <p className="mt-3 text-sm text-muted">
              {usersLoading
                ? "Loading…"
                : userTotal
                  ? `Showing ${(userPage - 1) * userPageSize + 1}–${Math.min(userTotal, userPage * userPageSize)} of ${userTotal} ${userRole === "author" ? "authors" : "readers"}${appliedQuery ? ` matching “${appliedQuery}”` : ""}`
                  : `No ${userRole === "author" ? "authors" : "readers"}${appliedQuery ? ` match “${appliedQuery}”` : " yet"}.`}
            </p>

            {tempShown && (
              <div className="mt-4 border border-accent px-4 py-3 text-sm">
                <p className="text-ink">
                  Temporary password for <strong>{tempShown.email}</strong>:
                </p>
                <p className="mt-2 select-all font-mono text-lg tracking-wide">{tempShown.password}</p>
                <p className="mt-2 text-xs text-muted">
                  Shown once. Send it to them, and ask them to change it under Settings → Change
                  password after they sign in.
                </p>
              </div>
            )}

            <ul className="mt-4 space-y-2">
              {users.map((u) => (
                <li key={u.id} className="border border-line px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-sm">
                      <p className="text-ink">
                        {u.email}
                        {u.displayName ? <span className="text-muted"> · {u.displayName}</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {[
                          u.isAuthor ? "Author" : null,
                          u.isBetaReader ? "Reader" : null,
                          u.isPlatformAdmin ? "Admin" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}{" "}
                        · {u.tier} · joined {when(u.createdAt)} · last sign-in {when(u.lastSignInAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Studio days: {u.passBankDays} banked
                        {u.passActiveUntil ? ` · pass running until ${when(u.passActiveUntil)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <button
                        type="button"
                        disabled={!!userBusy || !emailReady}
                        title={emailReady ? undefined : "Configure SMTP first"}
                        className="text-accent hover:underline disabled:opacity-50"
                        onClick={() => void userAction(u, "send_reset")}
                      >
                        {userBusy === `${u.id}:send_reset` ? "Sending…" : "Email reset link"}
                      </button>
                      <button
                        type="button"
                        disabled={!!userBusy}
                        className="text-danger hover:underline disabled:opacity-50"
                        onClick={() => void userAction(u, "temp_password")}
                      >
                        {userBusy === `${u.id}:temp_password` ? "Setting…" : "Set temporary password"}
                      </button>
                      <button
                        type="button"
                        className="text-accent hover:underline"
                        onClick={() => setGiftUserId(giftUserId === u.id ? null : u.id)}
                      >
                        {giftUserId === u.id ? "Close gift" : "Gift Studio days"}
                      </button>
                    </div>
                  </div>
                  {giftUserId === u.id && (
                    <div className="mt-3 border-t border-line pt-3">
                      <GiftForm
                        target={{ userId: u.id, label: u.email || "this user" }}
                        onDone={(msg) => {
                          setNote(msg);
                          setGiftUserId(null);
                          void loadUsers();
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {userTotal > userPageSize && (
              <nav className="mt-4 flex flex-wrap items-center gap-3 text-sm" aria-label="Pages">
                <button
                  type="button"
                  disabled={userPage <= 1 || usersLoading}
                  className="border border-line px-3 py-1 disabled:opacity-40"
                  onClick={() => setUserPage((p) => p - 1)}
                >
                  ← Previous
                </button>
                <label className="flex items-center gap-2 text-muted">
                  Page
                  <select
                    value={userPage}
                    onChange={(e) => setUserPage(Number(e.target.value))}
                    className="border border-line bg-paper px-2 py-1 text-ink"
                  >
                    {Array.from({ length: Math.ceil(userTotal / userPageSize) }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  of {Math.ceil(userTotal / userPageSize)}
                </label>
                <button
                  type="button"
                  disabled={userPage >= Math.ceil(userTotal / userPageSize) || usersLoading}
                  className="border border-line px-3 py-1 disabled:opacity-40"
                  onClick={() => setUserPage((p) => p + 1)}
                >
                  Next →
                </button>
              </nav>
            )}
          </section>
        )}

        {tab === "metrics" && <AdminMetrics onNote={setNote} />}

        {tab === "moderation" && <AdminModeration onNote={setNote} />}

        {tab === "gifts" && (
          <section className="mt-6 max-w-xl space-y-4">
            <div>
              <h2 className="font-display text-xl">Gift Studio days to every author</h2>
              <p className="mt-1 text-sm text-muted">
                Days unlock Studio&apos;s beta desk, ARC desk, audience lists, and unlimited projects.
                Gifts never include AI credits, and they can go past the 28-day earning cap (up to 90
                at a time). Everyone gets an in-app notice; bulk gifts don&apos;t email, so you stay
                under Gmail&apos;s daily sending limit.
              </p>
              <p className="mt-2 text-xs text-muted">
                To gift one person, search them on the Users tab and use Gift Studio days.
              </p>
            </div>
            <div className="border border-line p-4">
              <GiftForm target="all" onDone={setNote} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

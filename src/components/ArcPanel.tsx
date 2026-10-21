"use client";

import { useCallback, useEffect, useState } from "react";
import type { LabeledLink } from "@/lib/public-profile";
import { formatMailingAddress, reviewSiteKey, type MailingAddress } from "@/lib/arc";
import { ShareKit } from "@/components/ShareKit";

type ArcInvite = {
  id: string;
  email: string;
  displayName: string | null;
  status: "requested" | "active" | "denied" | "revoked";
  hasAccount: boolean;
  emailOptIn: boolean;
  lastReadAt: string | null;
  currentChapterTitle: string | null;
  finishedAt: string | null;
  finishedOnTime: boolean;
  lastRemindedAt: string | null;
  canRemind: boolean;
  reviewBody: string | null;
  reviewPosts: Record<string, string>;
  mailingAddress: MailingAddress | null;
};

type ArcState = {
  studioAccess: boolean;
  emailReady?: boolean;
  shareLink?: string;
  arcOpen?: boolean;
  deadline?: string | null;
  deadlinePassed?: boolean;
  windowOpen?: boolean;
  collectAddress?: boolean;
  reviewLinks?: LabeledLink[];
  invites?: ArcInvite[];
};

const SUGGESTED_SITES = ["Amazon", "Goodreads", "BookBub", "Barnes & Noble"];

/** Deadline is a calendar date; store end of that day in UTC so every reader sees the same date. */
function dateToDeadline(date: string) {
  return date ? `${date}T23:59:59.000Z` : null;
}

function deadlineToDate(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : "";
}

function shortDate(iso: string | null | undefined) {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString();
}

function label(inv: ArcInvite) {
  return inv.displayName?.trim() ? `${inv.displayName.trim()} — ${inv.email}` : inv.email;
}

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function ArcPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ArcState | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deadlineDate, setDeadlineDate] = useState("");
  const [collectAddress, setCollectAddress] = useState(false);
  const [links, setLinks] = useState<LabeledLink[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/arc`);
      const data = (await res.json()) as ArcState & { error?: string };
      if (!res.ok) {
        setNote(data.error || "Could not load ARC desk");
        return;
      }
      setState(data);
      setDeadlineDate(deadlineToDate(data.deadline));
      setCollectAddress(Boolean(data.collectAddress));
      setLinks(data.reviewLinks || []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}, ok?: string) {
    setBusy(`${action}:${String(extra.inviteId || "")}`);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/arc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Something went wrong");
        return false;
      }
      if (ok) setNote(ok);
      await load();
      return true;
    } finally {
      setBusy(null);
    }
  }

  if (loading && !state) return <p className="font-ui p-6 text-sm text-muted">Loading…</p>;

  if (state && !state.studioAccess) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-2xl">ARC readers</h2>
          <div className="font-ui mt-4 border border-line bg-paper p-5">
            <p className="text-sm text-ink">
              The ARC desk is included with <strong>Studio</strong>. Upgrade to send advance copies
              with a read-by deadline, remind readers by email, collect mailing addresses, and give
              readers one-tap review links.
            </p>
            <a href="/billing" className="mt-4 inline-block bg-accent px-4 py-2 text-sm text-paper">
              Upgrade to Studio
            </a>
          </div>
        </div>
      </div>
    );
  }

  const invites = state?.invites || [];
  const requests = invites.filter((i) => i.status === "requested");
  const readers = invites.filter((i) => i.status === "active");
  const reviewKeys = (state?.reviewLinks || []).map((l) => ({ ...l, key: reviewSiteKey(l) }));

  function exportCsv() {
    const header = ["Name", "Email", "Finished", "On time", "Reviews posted", "Mailing address", "Note"];
    const rows = readers.map((r) => [
      r.displayName || "",
      r.email,
      r.finishedAt ? new Date(r.finishedAt).toISOString().slice(0, 10) : "",
      r.finishedAt ? (r.finishedOnTime ? "yes" : "no") : "",
      reviewKeys.filter((k) => r.reviewPosts[k.key]).map((k) => k.label).join("; "),
      formatMailingAddress(r.mailingAddress),
      r.mailingAddress?.note || "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "arc-readers.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="font-ui mx-auto max-w-5xl space-y-8">
          <div>
            <h2 className="font-display text-2xl">ARC readers</h2>
            <p className="mt-1 text-sm text-muted">
              Give advance copies with a read-by deadline. After the deadline the manuscript closes,
              but readers keep their review links.
            </p>
            {!state?.emailReady && (
              <p className="mt-3 text-xs text-danger">
                Platform email isn&apos;t configured yet, so invites and reminders only show as
                in-app notifications.
              </p>
            )}
          </div>

          {note && <p className="text-sm text-ink">{note}</p>}

          <section className="border border-line p-4">
            <h3 className="font-display text-lg">
              {state?.windowOpen
                ? "ARC is open"
                : state?.arcOpen && state.deadlinePassed
                  ? "ARC deadline has passed"
                  : "ARC is closed"}
            </h3>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Read-by deadline
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="mt-1 block border border-line bg-paper px-3 py-2"
                />
              </label>
              {!state?.windowOpen ? (
                <button
                  type="button"
                  disabled={!!busy || !deadlineDate}
                  className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
                  onClick={() =>
                    void act(
                      "open",
                      { deadline: dateToDeadline(deadlineDate) },
                      "ARC opened. Followers were notified."
                    )
                  }
                >
                  Open ARC
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!!busy}
                    className="border border-line px-4 py-2 text-sm"
                    onClick={() =>
                      void act(
                        "saveSettings",
                        {
                          deadline: dateToDeadline(deadlineDate),
                          collectAddress,
                          reviewLinks: links,
                        },
                        "Deadline updated."
                      )
                    }
                  >
                    Update deadline
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    className="text-sm text-danger hover:underline"
                    onClick={() => {
                      if (window.confirm("End the ARC now? Readers lose access to the manuscript.")) {
                        void act("close", {}, "ARC ended.");
                      }
                    }}
                  >
                    End ARC now
                  </button>
                </>
              )}
            </div>
            {state?.shareLink && (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-muted">Request link:</span>
                <code className="break-all text-xs">{state.shareLink}</code>
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(state.shareLink!);
                    setNote("Link copied. Readers can request a copy while the ARC is open.");
                  }}
                >
                  Copy
                </button>
              </div>
            )}
            {state?.shareLink && state.windowOpen && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-accent">More ways to share</summary>
                <div className="mt-3">
                  <ShareKit
                    heading="Find ARC readers"
                    path={new URL(state.shareLink).pathname}
                    title="Advance copies available"
                    posts={[
                      {
                        label: "ARC call",
                        text: `ARC copies of my new book are open. Read it free before release${
                          state.deadline ? ` (read by ${shortDate(state.deadline)})` : ""
                        }:`,
                      },
                    ]}
                    newsletter={{
                      heading: "Read my next book before anyone else",
                      body: "I'm giving out free advance copies to readers who'll leave an honest review.",
                      buttonLabel: "Request a copy",
                    }}
                  />
                </div>
              </details>
            )}
          </section>

          <section className="border border-line p-4">
            <h3 className="font-display text-lg">Reviews and gifts</h3>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={collectAddress}
                onChange={(e) => setCollectAddress(e.target.checked)}
              />
              Let ARC readers submit a mailing address (for a physical copy or thank-you gift)
            </label>
            <p className="mt-4 text-sm text-ink">Review links</p>
            <p className="text-xs text-muted">
              Paste the review page for this book on each site. Readers see a button for each one
              after they finish.
            </p>
            <ul className="mt-2 space-y-2">
              {links.map((l, i) => (
                <li key={i} className="flex flex-wrap gap-2">
                  <input
                    value={l.label}
                    onChange={(e) =>
                      setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                    placeholder="Site"
                    className="w-40 border border-line bg-paper px-2 py-1.5 text-sm"
                  />
                  <input
                    value={l.url}
                    onChange={(e) =>
                      setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                    }
                    placeholder="https://…"
                    className="min-w-[14rem] flex-1 border border-line bg-paper px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    className="text-xs text-danger hover:underline"
                    onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {SUGGESTED_SITES.filter((s) => !links.some((l) => l.label === s)).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="border border-line px-2 py-1 text-accent"
                  onClick={() => setLinks((ls) => [...ls, { label: s, url: "" }])}
                >
                  + {s}
                </button>
              ))}
              <button
                type="button"
                className="border border-line px-2 py-1 text-accent"
                onClick={() => setLinks((ls) => [...ls, { label: "", url: "" }])}
              >
                + Other
              </button>
            </div>
            <button
              type="button"
              disabled={!!busy}
              className="mt-4 bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
              onClick={() =>
                void act(
                  "saveSettings",
                  { deadline: dateToDeadline(deadlineDate), collectAddress, reviewLinks: links },
                  "Saved."
                )
              }
            >
              Save
            </button>
          </section>

          <section className="border border-line p-4">
            <h3 className="font-display text-lg">Add an ARC reader</h3>
            <p className="mt-1 text-xs text-muted">
              They get an email with the link. They sign in with this email to read.
            </p>
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void act(
                  "invite",
                  { email: inviteEmail, displayName: inviteName },
                  `ARC sent to ${inviteEmail}.`
                ).then((ok) => {
                  if (ok) {
                    setInviteEmail("");
                    setInviteName("");
                  }
                });
              }}
            >
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="reader@email.com"
                className="min-w-[14rem] flex-1 border border-line bg-paper px-3 py-2 text-sm"
              />
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Name (optional)"
                className="w-44 border border-line bg-paper px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={!!busy || !state?.windowOpen}
                title={state?.windowOpen ? undefined : "Open the ARC first"}
                className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
              >
                Send ARC
              </button>
            </form>
          </section>

          {requests.length > 0 && (
            <section className="border border-line p-4">
              <h3 className="font-display text-lg">Requests ({requests.length})</h3>
              <ul className="mt-3 space-y-2">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-line px-3 py-2 text-sm">
                    <span>{label(r)}</span>
                    <span className="flex gap-3 text-xs">
                      <button
                        type="button"
                        disabled={!!busy}
                        className="text-accent hover:underline"
                        onClick={() => void act("approve", { inviteId: r.id }, `Approved ${r.email}.`)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        className="text-danger hover:underline"
                        onClick={() => void act("deny", { inviteId: r.id }, "Request declined.")}
                      >
                        Decline
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="border border-line p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg">ARC readers ({readers.length})</h3>
              {readers.length > 0 && (
                <button type="button" className="text-xs text-accent hover:underline" onClick={exportCsv}>
                  Export CSV
                </button>
              )}
            </div>
            {readers.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No ARC readers yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {readers.map((r) => {
                  const open = expandedId === r.id;
                  const posted = reviewKeys.filter((k) => r.reviewPosts[k.key]);
                  return (
                    <li key={r.id} className="border border-line px-3 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 text-sm">
                          <p className="font-medium">{label(r)}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {r.finishedAt
                              ? `Finished ${shortDate(r.finishedAt)}${r.finishedOnTime ? " · on time" : " · after deadline"}`
                              : r.currentChapterTitle
                                ? `Reading: ${r.currentChapterTitle}`
                                : "Not started"}
                            {" · "}Last read {shortDate(r.lastReadAt)}
                            {!r.hasAccount ? " · no account yet" : ""}
                          </p>
                          {posted.length > 0 && (
                            <p className="mt-0.5 text-xs text-accent">
                              Says they posted on: {posted.map((p) => p.label).join(", ")}
                            </p>
                          )}
                        </div>
                        <span className="flex flex-wrap gap-3 text-xs">
                          {!r.finishedAt && state?.windowOpen &&
                            (!r.hasAccount ? (
                              <span className="text-muted" title="They need a reader account before reminders can reach them">
                                No account yet
                              </span>
                            ) : r.canRemind ? (
                              <button
                                type="button"
                                disabled={!!busy}
                                className="text-accent hover:underline"
                                title={
                                  r.emailOptIn
                                    ? "Email and in-app reminder. Email replies go to you."
                                    : "They haven't turned on emails, so this arrives as an in-app notification."
                                }
                                onClick={() =>
                                  void act(
                                    "remind",
                                    { inviteId: r.id },
                                    r.emailOptIn
                                      ? `Reminder emailed to ${r.email} and sent in the app.`
                                      : `Reminder sent in the app. ${r.email} hasn't turned on email notifications.`
                                  )
                                }
                              >
                                {busy === `remind:${r.id}`
                                  ? "Sending…"
                                  : r.emailOptIn
                                    ? "Remind about deadline"
                                    : "Remind about deadline (in-app only)"}
                              </button>
                            ) : (
                              <span className="text-muted">Reminded {shortDate(r.lastRemindedAt)}</span>
                            ))}
                          {(r.reviewBody || r.mailingAddress) && (
                            <button
                              type="button"
                              className="text-muted hover:underline"
                              onClick={() => setExpandedId(open ? null : r.id)}
                            >
                              {open ? "Hide details" : "Details"}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!!busy}
                            className="text-danger hover:underline"
                            onClick={() => {
                              if (window.confirm(`Remove ${r.email} from this ARC?`)) {
                                void act("remove", { inviteId: r.id }, "Reader removed.");
                              }
                            }}
                          >
                            Remove
                          </button>
                        </span>
                      </div>
                      {open && (
                        <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm">
                          {r.reviewBody && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted">Their review note</p>
                              <p className="mt-1 whitespace-pre-wrap">{r.reviewBody}</p>
                            </div>
                          )}
                          {r.mailingAddress && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted">Mailing address</p>
                              <p className="mt-1">{formatMailingAddress(r.mailingAddress)}</p>
                              {r.mailingAddress.note && (
                                <p className="mt-1 text-xs text-muted">Note: {r.mailingAddress.note}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

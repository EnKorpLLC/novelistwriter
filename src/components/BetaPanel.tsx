"use client";

import { useEffect, useMemo, useState } from "react";
import type { Chapter } from "@/lib/types";
import type { BetaApplicationForm, BetaFormField, BetaFormFollowUp } from "@/lib/beta-form";
import { applicationAnswerLines, newFormFieldId, normalizeBetaApplicationForm } from "@/lib/beta-form";

type ChapterProgress = {
  chapterId: string;
  title: string;
  percent: number;
};

type Invite = {
  id: string;
  email: string;
  status: string;
  link: string | null;
  created_at: string;
  applicationAnswers?: Record<string, string>;
  dnfReason?: string | null;
  dnfAt?: string | null;
  chapterProgress?: ChapterProgress[];
  currentChapter?: { id: string; title: string; percent: number } | null;
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
  const [formFields, setFormFields] = useState<BetaFormField[]>([]);
  const [draftIntro, setDraftIntro] = useState("");
  const [draftWarnings, setDraftWarnings] = useState("");
  const [includeIntro, setIncludeIntro] = useState(false);
  const [includeWarnings, setIncludeWarnings] = useState(false);
  const [draftFields, setDraftFields] = useState<BetaFormField[]>([]);
  const [applyLink, setApplyLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [expandedInvite, setExpandedInvite] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/beta`);
      const data = await res.json();
      if (res.ok) {
        setInvites(data.invites || []);
        setComments(data.comments || []);
        setApplyLink(data.applyLink || "");
        const form = normalizeBetaApplicationForm(data.applicationForm);
        setFormFields(form.fields);
        setDraftFields(form.fields);
        setDraftIntro(form.intro);
        setDraftWarnings(form.contentWarnings);
        setIncludeIntro(Boolean(form.intro));
        setIncludeWarnings(Boolean(form.contentWarnings));
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
    (i) => i.status === "pending" || i.status === "accepted" || i.status === "dnf"
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

  async function saveForm() {
    setSavingForm(true);
    try {
      const payload: BetaApplicationForm = {
        intro: includeIntro ? draftIntro : "",
        contentWarnings: includeWarnings ? draftWarnings : "",
        fields: draftFields,
      };
      const res = await fetch(`/api/projects/${projectId}/beta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveForm",
          intro: payload.intro,
          contentWarnings: payload.contentWarnings,
          fields: payload.fields,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Could not save form");
        return;
      }
      const form = normalizeBetaApplicationForm(data.applicationForm || payload);
      setFormFields(form.fields);
      setDraftFields(form.fields);
      setDraftIntro(form.intro);
      setDraftWarnings(form.contentWarnings);
      setIncludeIntro(Boolean(form.intro));
      setIncludeWarnings(Boolean(form.contentWarnings));
      setNote("Application form saved.");
    } finally {
      setSavingForm(false);
    }
  }

  function answerLines(inv: Invite) {
    return applicationAnswerLines(
      {
        intro: draftIntro,
        contentWarnings: draftWarnings,
        fields: formFields,
      },
      inv.applicationAnswers || {}
    );
  }

  function updateField(idx: number, patch: Partial<BetaFormField>) {
    setDraftFields((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function updateFollowUp(
    idx: number,
    branch: "followUpYes" | "followUpNo",
    patch: Partial<BetaFormFollowUp> | null
  ) {
    setDraftFields((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        if (patch === null) {
          const next = { ...r };
          delete next[branch];
          return next;
        }
        const prev = r[branch] || {
          enabled: true,
          label: "",
          type: "short" as const,
          required: false,
        };
        return { ...r, [branch]: { ...prev, ...patch, enabled: true } };
      })
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-8">
          <div>
            <h2 className="font-display text-2xl">Beta readers</h2>
            <p className="mt-1 text-sm text-muted">
              Build an application form, invite people, track reading progress, and review comments.
            </p>
          </div>

          <section className="font-ui border border-line p-4">
            <h3 className="font-display text-lg">Application form</h3>
            <p className="mt-1 text-xs text-muted">
              Optional intro and content warnings, then questions. Email is always collected.
            </p>

            <div className="mt-4 space-y-3 border border-line p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeIntro}
                  onChange={(e) => setIncludeIntro(e.target.checked)}
                />
                Add intro paragraph
              </label>
              {includeIntro && (
                <textarea
                  className="w-full border border-line px-2 py-1.5 text-sm"
                  rows={3}
                  value={draftIntro}
                  onChange={(e) => setDraftIntro(e.target.value)}
                  placeholder="Welcome applicants / what you’re looking for…"
                />
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeWarnings}
                  onChange={(e) => setIncludeWarnings(e.target.checked)}
                />
                Add content / trigger warnings paragraph
              </label>
              {includeWarnings && (
                <textarea
                  className="w-full border border-line px-2 py-1.5 text-sm"
                  rows={3}
                  value={draftWarnings}
                  onChange={(e) => setDraftWarnings(e.target.value)}
                  placeholder="List content or trigger warnings applicants should know…"
                />
              )}
            </div>

            <ul className="mt-3 space-y-3">
              {draftFields.map((field, idx) => (
                <li key={field.id} className="space-y-2 border border-line p-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_8rem_auto_auto]">
                    <input
                      className="border border-line px-2 py-1.5 text-sm"
                      value={field.label}
                      placeholder="Question"
                      onChange={(e) => updateField(idx, { label: e.target.value })}
                    />
                    <select
                      className="border border-line px-2 py-1.5 text-sm"
                      value={field.type}
                      onChange={(e) => {
                        const type = e.target.value as BetaFormField["type"];
                        updateField(idx, {
                          type,
                          ...(type !== "yesno"
                            ? { followUpYes: undefined, followUpNo: undefined }
                            : {}),
                        });
                      }}
                    >
                      <option value="short">Short answer</option>
                      <option value="long">Long answer</option>
                      <option value="yesno">Yes / No</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(e) => updateField(idx, { required: e.target.checked })}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      className="text-xs text-danger"
                      onClick={() => setDraftFields((rows) => rows.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </div>

                  {field.type === "yesno" && (
                    <div className="space-y-2 border-t border-line pt-2">
                      {(
                        [
                          ["followUpYes", "If they answer Yes", field.followUpYes],
                          ["followUpNo", "If they answer No", field.followUpNo],
                        ] as const
                      ).map(([key, title, follow]) => (
                        <div key={key} className="rounded-sm bg-paper-deep/30 p-2">
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={Boolean(follow?.enabled)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updateFollowUp(idx, key, {
                                    enabled: true,
                                    label: follow?.label || "",
                                    type: follow?.type || "short",
                                    required: follow?.required || false,
                                  });
                                } else {
                                  updateFollowUp(idx, key, null);
                                }
                              }}
                            />
                            Add related question {title.toLowerCase()}
                          </label>
                          {follow?.enabled && (
                            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_7rem_auto]">
                              <input
                                className="border border-line px-2 py-1.5 text-sm"
                                value={follow.label}
                                placeholder="Follow-up question"
                                onChange={(e) =>
                                  updateFollowUp(idx, key, { label: e.target.value })
                                }
                              />
                              <select
                                className="border border-line px-2 py-1.5 text-sm"
                                value={follow.type}
                                onChange={(e) =>
                                  updateFollowUp(idx, key, {
                                    type: e.target.value === "long" ? "long" : "short",
                                  })
                                }
                              >
                                <option value="short">Short</option>
                                <option value="long">Long</option>
                              </select>
                              <label className="flex items-center gap-1 text-xs text-muted">
                                <input
                                  type="checkbox"
                                  checked={Boolean(follow.required)}
                                  onChange={(e) =>
                                    updateFollowUp(idx, key, { required: e.target.checked })
                                  }
                                />
                                Required
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="border border-line px-3 py-1.5 text-xs"
                onClick={() =>
                  setDraftFields((rows) => [
                    ...rows,
                    { id: newFormFieldId(), label: "", type: "short", required: false },
                  ])
                }
              >
                + Question
              </button>
              <button
                type="button"
                disabled={savingForm}
                className="bg-accent px-3 py-1.5 text-xs text-paper disabled:opacity-50"
                onClick={() => void saveForm()}
              >
                {savingForm ? "Saving…" : "Save form"}
              </button>
            </div>
          </section>

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
                Share this so readers fill out your form first.
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
              <p className="mt-1 text-sm text-muted">Review answers, then approve or deny.</p>
              <ul className="font-ui mt-3 space-y-2">
                {requests.map((inv) => {
                  const lines = answerLines(inv);
                  const open = expandedInvite === inv.id;
                  return (
                    <li
                      key={inv.id}
                      className="border border-accent/40 bg-accent/5 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          className="text-left text-sm"
                          onClick={() => setExpandedInvite(open ? null : inv.id)}
                        >
                          {inv.email}
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">
                            requested
                          </span>
                          {lines.length > 0 && (
                            <span className="ml-2 text-[10px] text-accent">
                              {open ? "Hide answers" : "View answers"}
                            </span>
                          )}
                        </button>
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
                      </div>
                      {open && (
                        <div className="mt-2 space-y-2 border-t border-accent/20 pt-2 text-sm">
                          {lines.length === 0 ? (
                            <p className="text-muted">No form answers (email only).</p>
                          ) : (
                            lines.map((line) => (
                              <div key={line.label}>
                                <p className="text-[10px] uppercase tracking-wide text-muted">
                                  {line.label}
                                </p>
                                <p className="whitespace-pre-wrap text-ink">{line.value}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
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
                {readers.map((inv) => {
                  const isDnf = inv.status === "dnf";
                  const open = expandedInvite === inv.id;
                  const lines = answerLines(inv);
                  return (
                    <li
                      key={inv.id}
                      className={`border px-3 py-2 ${
                        isDnf
                          ? "border-danger/50 bg-danger/10 text-danger"
                          : "border-line"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <button
                          type="button"
                          className={`min-w-0 flex-1 text-left text-sm ${isDnf ? "text-danger" : ""}`}
                          onClick={() => setExpandedInvite(open ? null : inv.id)}
                        >
                          <span className="font-medium">{inv.email}</span>{" "}
                          <span
                            className={`text-[10px] uppercase tracking-wide ${
                              isDnf ? "text-danger" : "text-muted"
                            }`}
                          >
                            {isDnf ? "DNF" : inv.status === "accepted" ? "reading" : "invited"}
                          </span>
                          {inv.currentChapter && (
                            <span className={`mt-1 block text-xs ${isDnf ? "text-danger/90" : "text-muted"}`}>
                              Now: {inv.currentChapter.title} · {inv.currentChapter.percent}%
                            </span>
                          )}
                        </button>
                        <span className="flex gap-2">
                          {inv.link && !isDnf && (
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
                            className={`text-xs hover:underline ${isDnf ? "text-danger" : "text-danger"}`}
                            onClick={() => {
                              if (confirm(`Remove ${inv.email}? Their link will stop working.`)) {
                                void act(inv.id, "remove");
                              }
                            }}
                          >
                            Remove
                          </button>
                        </span>
                      </div>
                      {open && (
                        <div className={`mt-3 space-y-3 border-t pt-3 text-sm ${isDnf ? "border-danger/30" : "border-line"}`}>
                          {isDnf && inv.dnfReason && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide">DNF reason</p>
                              <p className="mt-1 whitespace-pre-wrap">{inv.dnfReason}</p>
                            </div>
                          )}
                          {lines.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] uppercase tracking-wide opacity-80">
                                Application
                              </p>
                              {lines.map((line) => (
                                <div key={line.label}>
                                  <p className="text-[10px] uppercase tracking-wide opacity-70">
                                    {line.label}
                                  </p>
                                  <p className="whitespace-pre-wrap">{line.value}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] uppercase tracking-wide opacity-80">
                              Chapters read
                            </p>
                            {(inv.chapterProgress || []).length === 0 ? (
                              <p className="mt-1 text-xs opacity-70">No reading progress yet.</p>
                            ) : (
                              <ul className="mt-1 space-y-1">
                                {(inv.chapterProgress || []).map((ch) => (
                                  <li key={ch.chapterId} className="flex justify-between gap-2 text-xs">
                                    <span className="truncate">{ch.title}</span>
                                    <span>{ch.percent}%</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
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
                        {c.excerpt && (
                          <blockquote className="mt-2 border-l-2 border-accent/50 pl-3 text-sm italic text-muted">
                            “{c.excerpt}”
                          </blockquote>
                        )}
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

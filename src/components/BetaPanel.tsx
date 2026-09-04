"use client";

import { useEffect, useMemo, useState } from "react";
import type { Chapter } from "@/lib/types";
import type { BetaApplicationForm, BetaFormField, BetaFormFollowUp } from "@/lib/beta-form";
import { applicationAnswerLines, newFormFieldId, normalizeBetaApplicationForm } from "@/lib/beta-form";
import {
  normalizeBetaAutoApprove,
  type BetaAutoApproveSettings,
  BETA_PERIOD_ENDED_REASON,
} from "@/lib/beta-access";

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
  displayName?: string | null;
  statusReason?: string | null;
  lastReadAt?: string | null;
};

type Contact = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
};

type Comment = {
  id: string;
  body: string;
  excerpt: string | null;
  chapterId: string | null;
  chapterTitle: string | null;
  chapterOrder: number;
  readerEmail: string | null;
  readerName?: string | null;
  completed: boolean;
  createdAt: string;
};

type Props = {
  projectId: string;
  chapters: Chapter[];
  /** Jump to a chapter in Write and highlight the comment excerpt */
  onOpenComment?: (chapterId: string, excerpt: string | null) => void;
};

const GENERAL = "__general__";

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso.length >= 10 ? iso.slice(0, 10) : "";
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inviteLabel(inv: Invite): string {
  if (inv.displayName?.trim()) return `${inv.displayName.trim()} — ${inv.email}`;
  return inv.email;
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function BetaPanel({ projectId, chapters, onOpenComment }: Props) {
  const [email, setEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [formFields, setFormFields] = useState<BetaFormField[]>([]);
  const [draftIntro, setDraftIntro] = useState("");
  const [draftWarnings, setDraftWarnings] = useState("");
  const [includeIntro, setIncludeIntro] = useState(false);
  const [includeWarnings, setIncludeWarnings] = useState(false);
  const [draftFields, setDraftFields] = useState<BetaFormField[]>([]);
  const [autoApprove, setAutoApprove] = useState<BetaAutoApproveSettings>({
    mode: "off",
    rules: [],
  });
  const [expiresAt, setExpiresAt] = useState("");
  const [periodEnded, setPeriodEnded] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [reasonPrompt, setReasonPrompt] = useState<null | {
    inviteId: string;
    action: "deny" | "remove";
    email: string;
  }>(null);
  const [reasonText, setReasonText] = useState("");
  const [applyLink, setApplyLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [expandedInvite, setExpandedInvite] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [accessSettingsOpen, setAccessSettingsOpen] = useState(false);
  const [answersOpenId, setAnswersOpenId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/beta`);
      const data = await res.json();
      if (res.ok) {
        setInvites(data.invites || []);
        setContacts(data.contacts || []);
        setAutoApprove(normalizeBetaAutoApprove(data.autoApprove));
        setExpiresAt(toDateInput(data.expiresAt));
        setPeriodEnded(Boolean(data.periodEnded));
        setComments(
          (data.comments || []).map((c: Comment) => ({
            ...c,
            completed: Boolean(c.completed),
          }))
        );
        setApplyLink(data.applyLink || "");
        const form = normalizeBetaApplicationForm(data.applicationForm);
        setFormFields(form.fields);
        setDraftFields(form.fields);
        setDraftIntro(form.intro);
        setDraftWarnings(form.contentWarnings);
        setIncludeIntro(Boolean(form.intro));
        setIncludeWarnings(Boolean(form.contentWarnings));
      } else if (data.error) {
        setNote(data.error);
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

  const yesNoFields = useMemo(() => {
    const source = draftFields.length ? draftFields : formFields;
    return source.filter((f) => f.type === "yesno");
  }, [draftFields, formFields]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of comments) {
      if (c.completed) continue;
      const key = c.chapterId || GENERAL;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [comments]);

  const openCount = useMemo(
    () => comments.filter((c) => !c.completed).length,
    [comments]
  );

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
    .filter((c) => showCompleted || !c.completed)
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  async function commentAct(
    commentId: string,
    action: "complete" | "uncomplete" | "delete"
  ) {
    if (action === "delete") {
      const ok = window.confirm("Delete this comment permanently?");
      if (!ok) return;
    }
    setBusyCommentId(commentId);
    try {
      const res = await fetch(`/api/projects/${projectId}/beta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Update failed");
        return;
      }
      if (action === "delete") {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setNote("Comment deleted.");
      } else {
        const completed = action === "complete";
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, completed } : c))
        );
        setNote(completed ? "Marked complete." : "Marked open again.");
      }
    } finally {
      setBusyCommentId(null);
    }
  }

  async function invite() {
    const res = await fetch(`/api/projects/${projectId}/beta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        ...(inviteName.trim() ? { displayName: inviteName.trim() } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNote(data.error || "Invite failed");
      return;
    }
    setEmail("");
    setInviteName("");
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

  async function act(
    inviteId: string,
    action: "approve" | "deny" | "remove",
    reason?: string
  ) {
    if (action === "deny" || action === "remove") {
      if (!reason?.trim()) {
        const inv = invites.find((i) => i.id === inviteId);
        setReasonPrompt({
          inviteId,
          action,
          email: inv?.email || "",
        });
        setReasonText("");
        return;
      }
    }
    const res = await fetch(`/api/projects/${projectId}/beta`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId, action, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNote(data.error || "Update failed");
      return;
    }
    setReasonPrompt(null);
    setReasonText("");
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

  async function saveAccessSettings() {
    setSavingAccess(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/beta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveAccessSettings",
          autoApprove,
          expiresAt: expiresAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Could not save access settings");
        return;
      }
      setAutoApprove(normalizeBetaAutoApprove(data.autoApprove));
      setExpiresAt(toDateInput(data.expiresAt));
      setNote("Access settings saved.");
      void load();
    } finally {
      setSavingAccess(false);
    }
  }

  async function deleteContact(contactId: string) {
    const contact = contacts.find((c) => c.id === contactId);
    const label = contact
      ? contact.displayName
        ? `${contact.displayName} (${contact.email})`
        : contact.email
      : "this contact";
    if (!window.confirm(`Delete ${label} from contacts?`)) return;
    const res = await fetch(`/api/projects/${projectId}/beta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteContact", contactId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNote(data.error || "Could not delete contact");
      return;
    }
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
    setNote("Contact deleted.");
  }

  function exportEmailsCsv() {
    let rows: { name: string; email: string }[];
    if (contacts.length > 0) {
      rows = contacts.map((c) => ({
        name: c.displayName || "",
        email: c.email,
      }));
    } else {
      const seen = new Set<string>();
      rows = [];
      for (const inv of invites) {
        const key = inv.email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ name: inv.displayName || "", email: inv.email });
      }
    }
    const lines = [
      "Name,Email",
      ...rows.map((r) => `${csvEscape(r.name)},${csvEscape(r.email)}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "beta-readers.csv";
    a.click();
    URL.revokeObjectURL(url);
    setNote("CSV downloaded.");
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
            <button
              type="button"
              className="flex w-full items-baseline justify-between gap-3 text-left"
              onClick={() => setFormEditorOpen((o) => !o)}
              aria-expanded={formEditorOpen}
            >
              <span>
                <span className="font-display block text-lg text-ink">Application form</span>
                <span className="mt-1 block text-xs text-muted">
                  {formFields.length
                    ? `${formFields.length} question${formFields.length === 1 ? "" : "s"} saved`
                    : "Optional intro and questions for applicants"}
                </span>
              </span>
              <span className="shrink-0 text-xs text-accent">
                {formEditorOpen ? "Collapse" : "Edit"}
              </span>
            </button>

            {formEditorOpen && (
              <div className="mt-4">
                <p className="text-xs text-muted">
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
              </div>
            )}
          </section>

          <section className="font-ui grid gap-4 border border-line p-4 md:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Invite by email</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  className="min-w-[8rem] flex-1 border border-line px-3 py-2 text-sm"
                  placeholder="Name (optional)"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
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

          <section className="font-ui border border-line p-4">
            <button
              type="button"
              className="flex w-full items-baseline justify-between gap-3 text-left"
              onClick={() => setAccessSettingsOpen((o) => !o)}
              aria-expanded={accessSettingsOpen}
            >
              <span>
                <span className="font-display block text-lg text-ink">Access settings</span>
                <span className="mt-1 block text-xs text-muted">
                  {autoApprove.mode === "off"
                    ? "Auto-approve off"
                    : autoApprove.mode === "all"
                      ? "Auto-approve all"
                      : `Auto-approve by rules (${autoApprove.rules.length})`}
                  {expiresAt ? ` · Ends ${expiresAt}` : ""}
                </span>
                {periodEnded && (
                  <span className="mt-1 block text-xs text-danger">
                    Beta period ended — readers were removed.
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-accent">
                {accessSettingsOpen ? "Collapse" : "Edit"}
              </span>
            </button>

            {accessSettingsOpen && (
              <div className="mt-4">
                <p className="text-xs text-muted">
                  Auto-approve applicants and set when the beta period ends.
                </p>
                {periodEnded && (
                  <p className="mt-2 text-sm text-danger">
                    Beta period ended — readers were removed. {BETA_PERIOD_ENDED_REASON}
                  </p>
                )}
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-muted">
                      Auto-approve
                    </label>
                    <select
                      className="mt-1 w-full border border-line px-2 py-1.5 text-sm"
                      value={autoApprove.mode}
                      onChange={(e) => {
                        const mode = e.target.value as BetaAutoApproveSettings["mode"];
                        setAutoApprove((prev) => ({ ...prev, mode }));
                      }}
                    >
                      <option value="off">Off</option>
                      <option value="all">Approve all</option>
                      <option value="rules">Approve by yes/no rules</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-muted">
                      Expiration date
                    </label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input
                        type="date"
                        className="border border-line px-2 py-1.5 text-sm"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                      />
                      {expiresAt && (
                        <button
                          type="button"
                          className="border border-line px-2 py-1.5 text-xs text-muted"
                          onClick={() => setExpiresAt("")}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {autoApprove.mode === "rules" && (
                  <div className="mt-3 space-y-2 border border-line p-3">
                    <p className="text-xs text-muted">
                      Approve when all rules match (yes/no form questions).
                    </p>
                    {yesNoFields.length === 0 ? (
                      <p className="text-xs text-muted">
                        Add yes/no questions to the application form to create rules.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {autoApprove.rules.map((rule, idx) => (
                          <li
                            key={`${rule.fieldId}-${idx}`}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <select
                              className="min-w-[10rem] flex-1 border border-line px-2 py-1.5 text-sm"
                              value={rule.fieldId}
                              onChange={(e) => {
                                const fieldId = e.target.value;
                                setAutoApprove((prev) => ({
                                  ...prev,
                                  rules: prev.rules.map((r, i) =>
                                    i === idx ? { ...r, fieldId } : r
                                  ),
                                }));
                              }}
                            >
                              {yesNoFields.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.label || "Untitled question"}
                                </option>
                              ))}
                            </select>
                            <select
                              className="border border-line px-2 py-1.5 text-sm"
                              value={rule.answer}
                              onChange={(e) => {
                                const answer = e.target.value === "no" ? "no" : "yes";
                                setAutoApprove((prev) => ({
                                  ...prev,
                                  rules: prev.rules.map((r, i) =>
                                    i === idx ? { ...r, answer } : r
                                  ),
                                }));
                              }}
                            >
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                            <button
                              type="button"
                              className="text-xs text-danger"
                              onClick={() =>
                                setAutoApprove((prev) => ({
                                  ...prev,
                                  rules: prev.rules.filter((_, i) => i !== idx),
                                }))
                              }
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {yesNoFields.length > 0 && (
                      <button
                        type="button"
                        className="border border-line px-3 py-1.5 text-xs"
                        onClick={() =>
                          setAutoApprove((prev) => ({
                            ...prev,
                            rules: [
                              ...prev.rules,
                              { fieldId: yesNoFields[0].id, answer: "yes" },
                            ],
                          }))
                        }
                      >
                        + Rule
                      </button>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  disabled={savingAccess}
                  className="mt-3 bg-accent px-3 py-1.5 text-xs text-paper disabled:opacity-50"
                  onClick={() => void saveAccessSettings()}
                >
                  {savingAccess ? "Saving…" : "Save access settings"}
                </button>
              </div>
            )}
          </section>

          {reasonPrompt && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
              <div className="font-ui w-full max-w-md border border-line bg-paper p-4 shadow-sm">
                <h3 className="font-display text-lg text-ink">
                  {reasonPrompt.action === "deny" ? "Deny request" : "Remove reader"}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Reason for {reasonPrompt.email} (required). They may see this message.
                </p>
                <textarea
                  className="mt-3 w-full border border-line px-2 py-1.5 text-sm"
                  rows={3}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="Explain why…"
                  autoFocus
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="bg-accent px-3 py-1.5 text-xs text-paper disabled:opacity-50"
                    disabled={!reasonText.trim()}
                    onClick={() =>
                      void act(reasonPrompt.inviteId, reasonPrompt.action, reasonText)
                    }
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="border border-line px-3 py-1.5 text-xs"
                    onClick={() => {
                      setReasonPrompt(null);
                      setReasonText("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

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
                          {inviteLabel(inv)}
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
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-xl">Readers</h3>
              <button
                type="button"
                className="font-ui border border-line px-3 py-1.5 text-xs text-accent hover:border-accent"
                onClick={exportEmailsCsv}
              >
                Export emails (CSV)
              </button>
            </div>
            {loading && readers.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Loading…</p>
            ) : readers.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No active readers yet.</p>
            ) : (
              <ul className="font-ui mt-3 space-y-2">
                {readers.map((inv) => {
                  const isDnf = inv.status === "dnf";
                  const detailsOpen = expandedInvite === inv.id;
                  const answersOpen = answersOpenId === inv.id;
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
                        <div className={`min-w-0 flex-1 text-sm ${isDnf ? "text-danger" : ""}`}>
                          <span className="font-medium">{inviteLabel(inv)}</span>{" "}
                          <span
                            className={`text-[10px] uppercase tracking-wide ${
                              isDnf ? "text-danger" : "text-muted"
                            }`}
                          >
                            {isDnf ? "DNF" : inv.status === "accepted" ? "reading" : "invited"}
                          </span>
                          {inv.currentChapter && (
                            <span
                              className={`mt-1 block text-xs ${isDnf ? "text-danger/90" : "text-muted"}`}
                            >
                              Now: {inv.currentChapter.title} · {inv.currentChapter.percent}%
                            </span>
                          )}
                          <span
                            className={`mt-1 block text-xs ${isDnf ? "text-danger/90" : "text-muted"}`}
                          >
                            Last read:{" "}
                            {inv.lastReadAt
                              ? new Date(inv.lastReadAt).toLocaleString()
                              : "Never"}
                          </span>
                        </div>
                        <span className="flex flex-wrap gap-2">
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
                            className="text-xs text-danger hover:underline"
                            onClick={() => void act(inv.id, "remove")}
                          >
                            Remove
                          </button>
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {lines.length > 0 && (
                          <button
                            type="button"
                            className={isDnf ? "text-danger underline" : "text-accent hover:underline"}
                            onClick={() => setAnswersOpenId(answersOpen ? null : inv.id)}
                          >
                            {answersOpen ? "Hide answers" : "View answers"}
                          </button>
                        )}
                        <button
                          type="button"
                          className={isDnf ? "text-danger/80 underline" : "text-muted hover:underline"}
                          onClick={() => setExpandedInvite(detailsOpen ? null : inv.id)}
                        >
                          {detailsOpen ? "Hide progress" : "Chapter progress"}
                        </button>
                      </div>

                      {answersOpen && lines.length > 0 && (
                        <div
                          className={`mt-3 space-y-2 border-t pt-3 text-sm ${
                            isDnf ? "border-danger/30" : "border-line"
                          }`}
                        >
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

                      {detailsOpen && (
                        <div
                          className={`mt-3 space-y-3 border-t pt-3 text-sm ${
                            isDnf ? "border-danger/30" : "border-line"
                          }`}
                        >
                          {isDnf && inv.dnfReason && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide">DNF reason</p>
                              <p className="mt-1 whitespace-pre-wrap">{inv.dnfReason}</p>
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
                                  <li
                                    key={ch.chapterId}
                                    className="flex justify-between gap-2 text-xs"
                                  >
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
            <h3 className="font-display text-xl">Contacts</h3>
            <p className="mt-1 text-sm text-muted">
              Kept after the beta period ends. Export uses this list when available.
            </p>
            {contacts.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No contacts yet.</p>
            ) : (
              <ul className="font-ui mt-3 space-y-2">
                {contacts.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-line px-3 py-2"
                  >
                    <span className="text-sm">
                      {c.displayName ? (
                        <>
                          <span className="font-medium">{c.displayName}</span>
                          <span className="text-muted"> — {c.email}</span>
                        </>
                      ) : (
                        c.email
                      )}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-danger hover:underline"
                      onClick={() => void deleteContact(c.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="font-display text-xl">Comments</h3>
            <p className="mt-1 text-sm text-muted">
              {openCount} open · {comments.length} total. Pick a chapter — you only see that
              chapter’s notes.
            </p>
            <label className="font-ui mt-2 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
              />
              Show completed
            </label>
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
                    {chapterComments.map((c) => {
                      const busy = busyCommentId === c.id;
                      const readerLabel =
                        c.readerName && c.readerEmail
                          ? `${c.readerName} (${c.readerEmail})`
                          : c.readerName || c.readerEmail || "Reader";
                      return (
                        <li
                          key={c.id}
                          className={`border border-line px-3 py-3 ${
                            c.completed
                              ? "bg-paper-deep/15 opacity-70"
                              : "bg-paper-deep/30"
                          }`}
                        >
                          <div className="font-ui flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted">
                            <span>
                              {readerLabel}
                              {c.completed && (
                                <span className="ml-2 uppercase tracking-wide text-accent">
                                  completed
                                </span>
                              )}
                            </span>
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
                          <div className="font-ui mt-3 flex flex-wrap gap-2">
                            {c.chapterId && onOpenComment && (
                              <button
                                type="button"
                                disabled={busy}
                                className="border border-line px-3 py-1 text-xs text-accent hover:border-accent disabled:opacity-50"
                                onClick={() => onOpenComment(c.chapterId!, c.excerpt)}
                              >
                                {c.excerpt ? "Open in Write" : "Open chapter"}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              className="bg-accent px-3 py-1 text-xs text-paper disabled:opacity-50"
                              onClick={() =>
                                void commentAct(
                                  c.id,
                                  c.completed ? "uncomplete" : "complete"
                                )
                              }
                            >
                              {c.completed ? "Reopen" : "Complete"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className="border border-line px-3 py-1 text-xs text-danger disabled:opacity-50"
                              onClick={() => void commentAct(c.id, "delete")}
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      );
                    })}
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

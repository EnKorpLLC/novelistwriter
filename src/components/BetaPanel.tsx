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
import { REACTION_EMOJIS, type ReactionEmoji } from "@/lib/beta-platform";

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
  legacyLink?: string | null;
  created_at: string;
  applicationAnswers?: Record<string, string>;
  dnfReason?: string | null;
  dnfAt?: string | null;
  chapterProgress?: ChapterProgress[];
  currentChapter?: { id: string; title: string; percent: number } | null;
  displayName?: string | null;
  statusReason?: string | null;
  lastReadAt?: string | null;
  commentCount?: number;
  furthestSortOrder?: number;
  furthestPercent?: number;
  readerStats?: { finished: number; dnf: number; reading: number };
  reviewCount?: number;
  avgRating?: number | null;
  readerUserId?: string | null;
};

type ReaderReview = {
  id: string;
  rating: number | null;
  body: string;
  createdAt: string;
  authorName: string;
  projectTitle: string | null;
};

type Contact = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  inviteStatus?: string | null;
  canRestore?: boolean;
};

type CommentReaction = { emoji: string; userId: string };

type Comment = {
  id: string;
  body: string;
  excerpt: string | null;
  chapterId: string | null;
  chapterTitle: string | null;
  chapterOrder: number;
  inviteId?: string | null;
  parentId?: string | null;
  authorUserId?: string | null;
  readerEmail: string | null;
  readerName?: string | null;
  completed: boolean;
  createdAt: string;
  reactions?: CommentReaction[];
};

type ReaderSort = "recent" | "comments" | "furthest";

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
    match: "all",
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
  const [shareLink, setShareLink] = useState("");
  const [betaReady, setBetaReady] = useState(false);
  const [savingReady, setSavingReady] = useState(false);
  const [readerSort, setReaderSort] = useState<ReaderSort>("recent");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [expandedInvite, setExpandedInvite] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [accessSettingsOpen, setAccessSettingsOpen] = useState(false);
  const [readersOpen, setReadersOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [answersOpenId, setAnswersOpenId] = useState<string | null>(null);
  const [reviewsOpenId, setReviewsOpenId] = useState<string | null>(null);
  const [reviewsByInvite, setReviewsByInvite] = useState<Record<string, ReaderReview[]>>({});
  const [reviewsLoadingId, setReviewsLoadingId] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<string, { rating: string; text: string }>
  >({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [socialBusyId, setSocialBusyId] = useState<string | null>(null);
  const [studioAccess, setStudioAccess] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/beta`);
      const data = await res.json();
      if (data.code === "studio_required" || data.studioAccess === false) {
        setStudioAccess(false);
        setNote(data.error || "Beta reader tools require Studio.");
        setInvites([]);
        setContacts([]);
        setComments([]);
        setBetaReady(false);
        setShareLink("");
        setApplyLink("");
        return;
      }
      if (res.ok) {
        setStudioAccess(data.studioAccess !== false);
        setInvites(data.invites || []);
        setContacts(data.contacts || []);
        setAutoApprove(normalizeBetaAutoApprove(data.autoApprove));
        setExpiresAt(toDateInput(data.expiresAt));
        setPeriodEnded(Boolean(data.periodEnded));
        setBetaReady(Boolean(data.betaReady));
        setShareLink(data.shareLink || "");
        setComments(
          (data.comments || []).map((c: Comment) => ({
            ...c,
            completed: Boolean(c.completed),
            parentId: c.parentId ?? null,
            authorUserId: c.authorUserId ?? null,
            reactions: c.reactions || [],
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
  const readers = useMemo(() => {
    const list = invites.filter(
      (i) => i.status === "pending" || i.status === "accepted" || i.status === "dnf"
    );
    const sorted = [...list];
    if (readerSort === "comments") {
      sorted.sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0));
    } else if (readerSort === "furthest") {
      sorted.sort((a, b) => {
        const so = (b.furthestSortOrder ?? -1) - (a.furthestSortOrder ?? -1);
        if (so !== 0) return so;
        return (b.furthestPercent || 0) - (a.furthestPercent || 0);
      });
    } else {
      sorted.sort((a, b) => {
        const aLast = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
        const bLast = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
        if (aLast !== bLast) return bLast - aLast;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return sorted;
  }, [invites, readerSort]);
  const closed = invites.filter((i) => i.status === "denied" || i.status === "revoked");

  const yesNoFields = useMemo(() => {
    const source = draftFields.length ? draftFields : formFields;
    return source.filter((f) => f.type === "yesno");
  }, [draftFields, formFields]);

  const topLevelComments = useMemo(
    () => comments.filter((c) => !c.parentId),
    [comments]
  );

  const repliesByParent = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      if (!c.parentId) continue;
      const list = map.get(c.parentId) || [];
      list.push(c);
      map.set(c.parentId, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
    return map;
  }, [comments]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of topLevelComments) {
      if (c.completed) continue;
      const key = c.chapterId || GENERAL;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [topLevelComments]);

  const openCount = useMemo(
    () => topLevelComments.filter((c) => !c.completed).length,
    [topLevelComments]
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

  const chapterComments = topLevelComments
    .filter((c) => (c.chapterId || GENERAL) === activeChapter)
    .filter((c) => showCompleted || !c.completed)
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  async function setReady(next: boolean) {
    setSavingReady(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/beta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setReady", betaReady: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Could not update ready status");
        return;
      }
      setBetaReady(Boolean(data.betaReady));
      if (data.betaReady) {
        setNote("Marked ready for beta readers.");
      } else {
        const n = Number(data.revokedCount) || 0;
        setNote(
          n > 0
            ? `No longer ready — removed access for ${n} reader${n === 1 ? "" : "s"}.`
            : "No longer ready — reader access closed."
        );
        void load();
      }
    } finally {
      setSavingReady(false);
    }
  }

  async function reactToComment(commentId: string, emoji: ReactionEmoji) {
    setBusyCommentId(commentId);
    try {
      const res = await fetch("/api/beta/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "react", commentId, emoji }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Reaction failed");
        return;
      }
      void load();
    } finally {
      setBusyCommentId(null);
    }
  }

  async function replyToComment(parentId: string) {
    const text = (replyDrafts[parentId] || "").trim();
    if (!text) return;
    setBusyCommentId(parentId);
    try {
      const res = await fetch("/api/beta/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          parentId,
          projectId,
          text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Reply failed");
        return;
      }
      setReplyDrafts((prev) => ({ ...prev, [parentId]: "" }));
      setNote("Reply posted.");
      void load();
    } finally {
      setBusyCommentId(null);
    }
  }

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
        setComments((prev) =>
          prev.filter((c) => c.id !== commentId && c.parentId !== commentId)
        );
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

  async function restoreAccess(opts: { contactId?: string; inviteId?: string }) {
    if (!betaReady) {
      setNote("Mark the book Ready before restoring reader access.");
      return;
    }
    setSocialBusyId(opts.contactId || opts.inviteId || "restore");
    try {
      const res = await fetch(`/api/projects/${projectId}/beta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restoreAccess", ...opts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Could not restore access");
        return;
      }
      setNote("Access restored — reader can open the manuscript again.");
      void load();
    } finally {
      setSocialBusyId(null);
    }
  }

  function downloadCsv(
    filename: string,
    rows: { name: string; email: string }[]
  ) {
    const lines = [
      "Name,Email",
      ...rows.map((r) => `${csvEscape(r.name)},${csvEscape(r.email)}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportReadersCsv() {
    const active = invites.filter(
      (i) => i.status === "pending" || i.status === "accepted" || i.status === "dnf"
    );
    const seen = new Set<string>();
    const rows: { name: string; email: string }[] = [];
    for (const inv of active) {
      const key = inv.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ name: inv.displayName || "", email: inv.email });
    }
    if (!rows.length) {
      setNote("No active readers to export.");
      return;
    }
    downloadCsv("beta-readers.csv", rows);
    setNote(`Exported ${rows.length} reader${rows.length === 1 ? "" : "s"}.`);
  }

  function exportContactsCsv() {
    const rows = contacts.map((c) => ({
      name: c.displayName || "",
      email: c.email,
    }));
    if (!rows.length) {
      setNote("No contacts to export.");
      return;
    }
    downloadCsv("beta-contacts.csv", rows);
    setNote(`Exported ${rows.length} contact${rows.length === 1 ? "" : "s"}.`);
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

  function readerStatsLine(inv: Invite): string | null {
    const s = inv.readerStats;
    if (!s) return null;
    return `Finished ${s.finished} · DNF ${s.dnf} · Reading ${s.reading}`;
  }

  function reviewSummaryLine(inv: Invite): string | null {
    if (inv.reviewCount == null && inv.avgRating == null) return null;
    const parts: string[] = [];
    if (inv.reviewCount != null) parts.push(`Reviews: ${inv.reviewCount}`);
    if (inv.avgRating != null) parts.push(`Avg ${inv.avgRating.toFixed(1)}`);
    return parts.join(" · ");
  }

  async function loadReaderReviews(inv: Invite) {
    const open = reviewsOpenId === inv.id;
    if (open) {
      setReviewsOpenId(null);
      return;
    }
    setReviewsOpenId(inv.id);
    if (reviewsByInvite[inv.id]) return;
    setReviewsLoadingId(inv.id);
    try {
      const res = await fetch(
        `/api/beta/reader-reviews?email=${encodeURIComponent(inv.email)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Could not load reviews");
        return;
      }
      setReviewsByInvite((prev) => ({
        ...prev,
        [inv.id]: (data.reviews || []) as ReaderReview[],
      }));
    } finally {
      setReviewsLoadingId(null);
    }
  }

  async function submitReaderReview(inv: Invite) {
    const draft = reviewDrafts[inv.id] || { rating: "", text: "" };
    const text = draft.text.trim();
    if (!text) {
      setNote("Review text required.");
      return;
    }
    setSocialBusyId(inv.id);
    try {
      const ratingNum = draft.rating ? Number(draft.rating) : null;
      const res = await fetch("/api/beta/reader-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteId: inv.id,
          text,
          rating: ratingNum,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Could not post review");
        return;
      }
      setReviewDrafts((prev) => ({ ...prev, [inv.id]: { rating: "", text: "" } }));
      setNote("Review posted.");
      // Refresh cached reviews if the panel is open
      setReviewsByInvite((prev) => {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      });
      if (reviewsOpenId === inv.id) {
        setReviewsLoadingId(inv.id);
        try {
          const refresh = await fetch(
            `/api/beta/reader-reviews?email=${encodeURIComponent(inv.email)}`
          );
          const refreshData = await refresh.json();
          if (refresh.ok) {
            setReviewsByInvite((prev) => ({
              ...prev,
              [inv.id]: (refreshData.reviews || []) as ReaderReview[],
            }));
          }
        } finally {
          setReviewsLoadingId(null);
        }
      }
      void load();
    } finally {
      setSocialBusyId(null);
    }
  }

  async function sendReaderMessage(inv: Invite) {
    const text = (messageDrafts[inv.id] || "").trim();
    if (!text) {
      setNote("Message text required.");
      return;
    }
    setSocialBusyId(inv.id);
    try {
      const res = await fetch("/api/beta/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readerEmail: inv.email,
          readerUserId: inv.readerUserId,
          projectId,
          text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Could not send message");
        return;
      }
      setMessageDrafts((prev) => ({ ...prev, [inv.id]: "" }));
      setNote("Message sent.");
    } finally {
      setSocialBusyId(null);
    }
  }

  function renderInviteSocial(
    inv: Invite,
    tone: "default" | "danger" = "default",
    opts?: { hideStats?: boolean }
  ) {
    const stats = opts?.hideStats ? null : readerStatsLine(inv);
    const summary = opts?.hideStats ? null : reviewSummaryLine(inv);
    const reviewsOpen = reviewsOpenId === inv.id;
    const reviews = reviewsByInvite[inv.id];
    const loadingReviews = reviewsLoadingId === inv.id;
    const busy = socialBusyId === inv.id;
    const draft = reviewDrafts[inv.id] || { rating: "", text: "" };
    const labelClass = tone === "danger" ? "text-danger" : "text-muted";
    const accentClass =
      tone === "danger" ? "text-danger underline" : "text-accent hover:underline";

    return (
      <div className="space-y-3">
        {(stats || summary) && (
          <div className={`space-y-1 text-xs ${labelClass}`}>
            {stats && <p>{stats}</p>}
            {summary && <p>{summary}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs">
          <button
            type="button"
            className={accentClass}
            onClick={() => void loadReaderReviews(inv)}
          >
            {reviewsOpen ? "Hide reviews" : "View reviews"}
          </button>
        </div>

        {reviewsOpen && (
          <div className="space-y-2 border border-line bg-paper-deep/20 p-2 text-sm">
            {loadingReviews ? (
              <p className="text-xs text-muted">Loading reviews…</p>
            ) : !reviews?.length ? (
              <p className="text-xs text-muted">No reviews yet.</p>
            ) : (
              <ul className="space-y-2">
                {reviews.map((r) => (
                  <li key={r.id} className="border-b border-line pb-2 last:border-0 last:pb-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      {r.authorName}
                      {r.rating != null ? ` · ${r.rating}/5` : ""}
                      {r.projectTitle ? ` · ${r.projectTitle}` : ""}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-ink">{r.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted">Leave a review</p>
          <select
            className="border border-line px-2 py-1.5 text-sm"
            value={draft.rating}
            onChange={(e) =>
              setReviewDrafts((prev) => ({
                ...prev,
                [inv.id]: { ...draft, rating: e.target.value },
              }))
            }
          >
            <option value="">Rating (optional)</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
          <textarea
            className="w-full border border-line px-2 py-1.5 text-sm"
            rows={2}
            placeholder="How was this reader?"
            value={draft.text}
            onChange={(e) =>
              setReviewDrafts((prev) => ({
                ...prev,
                [inv.id]: { ...draft, text: e.target.value },
              }))
            }
          />
          <button
            type="button"
            disabled={busy || !draft.text.trim()}
            className="border border-line px-3 py-1 text-xs text-accent hover:border-accent disabled:opacity-50"
            onClick={() => void submitReaderReview(inv)}
          >
            Submit review
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted">Message</p>
          <textarea
            className="w-full border border-line px-2 py-1.5 text-sm"
            rows={2}
            placeholder="Write a message…"
            value={messageDrafts[inv.id] || ""}
            onChange={(e) =>
              setMessageDrafts((prev) => ({ ...prev, [inv.id]: e.target.value }))
            }
          />
          <button
            type="button"
            disabled={busy || !(messageDrafts[inv.id] || "").trim()}
            className="border border-line px-3 py-1 text-xs text-accent hover:border-accent disabled:opacity-50"
            onClick={() => void sendReaderMessage(inv)}
          >
            Send message
          </button>
        </div>
      </div>
    );
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
            {!studioAccess ? (
              <div className="mt-4 border border-line bg-paper p-5 font-ui">
                <p className="text-sm text-ink">
                  The beta reader desk is included with <strong>Studio</strong>. Upgrade to invite
                  readers, mark a book ready for the catalog, and share your book link.
                </p>
                <a
                  href="/billing"
                  className="mt-4 inline-block bg-accent px-4 py-2 text-sm text-paper"
                >
                  Upgrade to Studio
                </a>
              </div>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">
                  Turn on Ready, then copy your share link. Turning Ready off removes readers from
                  the manuscript (contacts stay so you can re-invite later).
                </p>
                {!loading && (
                  <label className="font-ui mt-3 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={betaReady}
                      disabled={savingReady}
                      onChange={(e) => void setReady(e.target.checked)}
                    />
                    Ready for beta readers
                  </label>
                )}
              </>
            )}
          </div>

          {studioAccess && (
          <>
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
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Share link</p>
                <p className="mt-1 text-xs text-muted">
                  Book gate for readers — prefer this over legacy token links.
                </p>
                <button
                  type="button"
                  className="mt-2 bg-accent px-3 py-2 text-xs text-paper disabled:opacity-50"
                  disabled={!shareLink}
                  onClick={() => {
                    if (!shareLink) return;
                    void navigator.clipboard.writeText(shareLink);
                    setNote("Share link copied.");
                  }}
                >
                  Copy share link
                </button>
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
                      : `Auto-approve by rules (${autoApprove.rules.length}, ${
                          autoApprove.match === "any" ? "OR" : "AND"
                        })`}
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
                    <div>
                      <label className="text-[10px] uppercase tracking-wide text-muted">
                        Match rules with
                      </label>
                      <select
                        className="mt-1 w-full border border-line px-2 py-1.5 text-sm md:max-w-xs"
                        value={autoApprove.match}
                        onChange={(e) => {
                          const match = e.target.value === "any" ? "any" : "all";
                          setAutoApprove((prev) => ({ ...prev, match }));
                        }}
                      >
                        <option value="all">AND — all rules must match</option>
                        <option value="any">OR — any one rule can match</option>
                      </select>
                      <p className="mt-1 text-xs text-muted">
                        {autoApprove.match === "any"
                          ? "Approve if the applicant matches at least one rule below."
                          : "Approve only if the applicant matches every rule below."}
                      </p>
                    </div>
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
                            {idx > 0 && (
                              <span className="w-full text-[10px] uppercase tracking-wide text-muted md:w-auto">
                                {autoApprove.match === "any" ? "or" : "and"}
                              </span>
                            )}
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
                      {(readerStatsLine(inv) || reviewSummaryLine(inv)) && (
                        <p className="mt-1 text-xs text-muted">
                          {[readerStatsLine(inv), reviewSummaryLine(inv)]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {open && (
                        <div className="mt-2 space-y-3 border-t border-accent/20 pt-2 text-sm">
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
                          {renderInviteSocial(inv, "default", { hideStats: true })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="font-ui border border-line p-4">
            <button
              type="button"
              className="flex w-full items-baseline justify-between gap-3 text-left"
              onClick={() => setReadersOpen((o) => !o)}
              aria-expanded={readersOpen}
            >
              <span>
                <span className="font-display block text-lg text-ink">Readers</span>
                <span className="mt-1 block text-xs text-muted">
                  {readers.length} active reader{readers.length === 1 ? "" : "s"}
                </span>
              </span>
              <span className="shrink-0 text-xs text-accent">
                {readersOpen ? "Collapse" : "Expand"}
              </span>
            </button>

            {readersOpen && (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="border border-line px-3 py-1.5 text-xs text-accent hover:border-accent"
                    onClick={exportReadersCsv}
                  >
                    Export readers (CSV)
                  </button>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    Sort
                    <select
                      className="border border-line px-2 py-1 text-xs text-ink"
                      value={readerSort}
                      onChange={(e) => setReaderSort(e.target.value as ReaderSort)}
                    >
                      <option value="recent">Most recent</option>
                      <option value="comments">Most comments</option>
                      <option value="furthest">Furthest chapter</option>
                    </select>
                  </label>
                </div>
                {loading && readers.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">Loading…</p>
                ) : readers.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No active readers yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
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
                              {(inv.commentCount || 0) > 0 && (
                                <span
                                  className={`ml-2 text-[10px] ${isDnf ? "text-danger/90" : "text-muted"}`}
                                >
                                  {inv.commentCount} comment
                                  {inv.commentCount === 1 ? "" : "s"}
                                </span>
                              )}
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
                                    setNote("Share link copied.");
                                  }}
                                >
                                  Copy link
                                </button>
                              )}
                              {inv.legacyLink && !isDnf && (
                                <button
                                  type="button"
                                  className="text-xs text-muted hover:underline"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(inv.legacyLink!);
                                    setNote("Invite claim link copied.");
                                  }}
                                >
                                  Invite claim link
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
                              {renderInviteSocial(inv, isDnf ? "danger" : "default")}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {closed.length > 0 && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="text-[11px] text-muted">
                      {closed.filter((i) => i.status === "denied").length} denied ·{" "}
                      {closed.filter((i) => i.status === "revoked").length} removed
                    </p>
                    <ul className="mt-2 space-y-2">
                      {closed.map((inv) => (
                        <li
                          key={inv.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            {inviteLabel(inv)}
                            <span className="ml-2 text-xs text-muted">
                              {inv.status === "denied" ? "denied" : "removed"}
                            </span>
                          </span>
                          <button
                            type="button"
                            disabled={!betaReady || socialBusyId === inv.id}
                            className="text-xs text-accent underline disabled:opacity-50"
                            onClick={() => void restoreAccess({ inviteId: inv.id })}
                          >
                            Restore access
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="font-ui border border-line p-4">
            <button
              type="button"
              className="flex w-full items-baseline justify-between gap-3 text-left"
              onClick={() => setContactsOpen((o) => !o)}
              aria-expanded={contactsOpen}
            >
              <span>
                <span className="font-display block text-lg text-ink">Contacts</span>
                <span className="mt-1 block text-xs text-muted">
                  {contacts.length} saved · restore access anytime the book is Ready
                </span>
              </span>
              <span className="shrink-0 text-xs text-accent">
                {contactsOpen ? "Collapse" : "Expand"}
              </span>
            </button>

            {contactsOpen && (
              <div className="mt-4">
                <button
                  type="button"
                  className="border border-line px-3 py-1.5 text-xs text-accent hover:border-accent"
                  onClick={exportContactsCsv}
                >
                  Export contacts (CSV)
                </button>
                {contacts.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No contacts yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
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
                          {c.inviteStatus && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">
                              {c.inviteStatus}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-3">
                          {c.canRestore && (
                            <button
                              type="button"
                              disabled={!betaReady || socialBusyId === c.id}
                              className="text-xs text-accent underline disabled:opacity-50"
                              onClick={() => void restoreAccess({ contactId: c.id })}
                            >
                              Restore access
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-xs text-danger hover:underline"
                            onClick={() => void deleteContact(c.id)}
                          >
                            Delete
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section>
            <h3 className="font-display text-xl">Comments</h3>
            <p className="mt-1 text-sm text-muted">
              {openCount} open · {topLevelComments.length} total. Pick a chapter — you only see that
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
                      const readerLabel = c.authorUserId
                        ? "You (author)"
                        : c.readerName && c.readerEmail
                          ? `${c.readerName} (${c.readerEmail})`
                          : c.readerName || c.readerEmail || "Reader";
                      const replies = repliesByParent.get(c.id) || [];
                      const reactionCounts = new Map<string, number>();
                      for (const r of c.reactions || []) {
                        reactionCounts.set(r.emoji, (reactionCounts.get(r.emoji) || 0) + 1);
                      }
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
                          <div className="font-ui mt-3 flex flex-wrap gap-1.5">
                            {REACTION_EMOJIS.map((re) => {
                              const count = reactionCounts.get(re.id) || 0;
                              return (
                                <button
                                  key={re.id}
                                  type="button"
                                  title={re.label}
                                  disabled={busy}
                                  className={`border px-2 py-0.5 text-xs disabled:opacity-50 ${
                                    count
                                      ? "border-accent/40 bg-accent/10"
                                      : "border-line"
                                  }`}
                                  onClick={() => void reactToComment(c.id, re.id)}
                                >
                                  {re.glyph}
                                  {count > 0 ? ` ${count}` : ""}
                                </button>
                              );
                            })}
                          </div>
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
                          <div className="font-ui mt-3 space-y-2 border-t border-line pt-3">
                            <textarea
                              className="w-full border border-line px-2 py-1.5 text-sm"
                              rows={2}
                              placeholder="Reply as author…"
                              value={replyDrafts[c.id] || ""}
                              onChange={(e) =>
                                setReplyDrafts((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              disabled={busy || !(replyDrafts[c.id] || "").trim()}
                              className="border border-line px-3 py-1 text-xs text-accent hover:border-accent disabled:opacity-50"
                              onClick={() => void replyToComment(c.id)}
                            >
                              Reply
                            </button>
                          </div>
                          {replies.length > 0 && (
                            <ul className="mt-3 space-y-2 border-l-2 border-line pl-3">
                              {replies.map((r) => {
                                const replyLabel = r.authorUserId
                                  ? "You (author)"
                                  : r.readerName && r.readerEmail
                                    ? `${r.readerName} (${r.readerEmail})`
                                    : r.readerName || r.readerEmail || "Reader";
                                return (
                                  <li key={r.id} className="text-sm">
                                    <div className="font-ui flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted">
                                      <span>{replyLabel}</span>
                                      <time dateTime={r.createdAt}>
                                        {new Date(r.createdAt).toLocaleString()}
                                      </time>
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap text-ink">{r.body}</p>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

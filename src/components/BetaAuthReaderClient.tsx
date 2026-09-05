"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BetaFormFields } from "@/components/BetaFormFields";
import type { BetaApplicationForm } from "@/lib/beta-form";

type Chapter = {
  id: string;
  title: string;
  content_html: string;
};

type HighlightPop = {
  excerpt: string;
  left: number;
  top: number;
  composing: boolean;
};

function chapterStorageKey(projectId: string) {
  return `nw_beta_chapter_${projectId}`;
}

function selectionInNode(root: HTMLElement | null): string {
  if (!root) return "";
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return "";
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return "";
  return sel.toString().replace(/\s+/g, " ").trim();
}

function selectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return rect;
}

function clampPop(rect: DOMRect, height: number): { left: number; top: number } {
  const vv = window.visualViewport;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;
  const ox = vv?.offsetLeft ?? 0;
  const oy = vv?.offsetTop ?? 0;
  const width = Math.min(360, vw - 16);
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.min(vw - width - 8, Math.max(8, left)) + ox;
  const below = rect.bottom + 10;
  const above = rect.top - height - 10;
  const top = below + height < vh - 8 ? below + oy : Math.max(8 + oy, above + oy);
  return { left, top };
}

const BetaManuscript = memo(function BetaManuscript({
  html,
  articleRef,
}: {
  html: string;
  articleRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <article
      ref={articleRef}
      className="manuscript-prose mt-4 max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export function BetaAuthReaderClient({
  projectId,
  initialChapterId,
}: {
  projectId: string;
  initialChapterId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const articleRef = useRef<HTMLElement>(null);
  const composingRef = useRef(false);
  const pointingRef = useRef(false);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentPercent = useRef(0);

  const [title, setTitle] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gateNeedsApplication, setGateNeedsApplication] = useState(false);
  const [form, setForm] = useState<BetaApplicationForm>({
    intro: "",
    contentWarnings: "",
    fields: [],
  });
  const [displayName, setDisplayName] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockMsg, setUnlockMsg] = useState("");
  const [loadError, setLoadError] = useState("");

  const [active, setActive] = useState("");
  const [generalBody, setGeneralBody] = useState("");
  const [generalMsg, setGeneralMsg] = useState("");
  const [pop, setPop] = useState<HighlightPop | null>(null);
  const [popBody, setPopBody] = useState("");
  const [popMsg, setPopMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dnf, setDnf] = useState(false);
  const [dnfOpen, setDnfOpen] = useState(false);
  const [dnfReason, setDnfReason] = useState("");
  const [dnfBusy, setDnfBusy] = useState(false);
  const [dnfMsg, setDnfMsg] = useState("");

  const [finished, setFinished] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishChecked, setFinishChecked] = useState(false);
  const [reviewBody, setReviewBody] = useState("");
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishMsg, setFinishMsg] = useState("");

  composingRef.current = pop?.composing ?? false;

  useEffect(() => {
    setMounted(true);
  }, []);

  function applySessionSuccess(data: {
    chapters?: Chapter[];
    status?: string;
    title?: string;
    currentChapterId?: string | null;
    finishedAt?: string | null;
    hasReview?: boolean;
    reviewBody?: string | null;
  }) {
    const list = Array.isArray(data.chapters) ? data.chapters : [];
    setChapters(list);
    setUnlocked(true);
    setGateNeedsApplication(false);
    if (data.title) setTitle(data.title);
    if (data.status === "dnf") setDnf(true);
    if (data.finishedAt || data.hasReview) {
      setFinished(true);
      setFinishChecked(true);
      if (data.reviewBody) setReviewBody(data.reviewBody);
    }

    const preferred =
      initialChapterId || searchParams.get("chapter") || data.currentChapterId;
    let id =
      preferred && list.some((c) => c.id === preferred) ? preferred : list[0]?.id || "";
    if (!preferred || !list.some((c) => c.id === preferred)) {
      try {
        const stored = localStorage.getItem(chapterStorageKey(projectId));
        if (stored && list.some((c) => c.id === stored)) id = stored;
      } catch {
        /* ignore */
      }
    }
    setActive(id);
  }

  const loadSession = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const q = initialChapterId
        ? `?chapter=${encodeURIComponent(initialChapterId)}`
        : "";
      const res = await fetch(`/api/beta/session/${projectId}${q}`);
      const data = await res.json();

      if (res.status === 401) {
        const next = encodeURIComponent(
          `/beta/read/${projectId}${initialChapterId ? `?chapter=${initialChapterId}` : ""}`
        );
        router.replace(`/login?next=${next}`);
        return;
      }

      if (res.status === 403 && data.redirect) {
        router.replace(data.redirect);
        return;
      }

      if (!res.ok) {
        setLoadError(data.error || data.message || "Could not load manuscript.");
        return;
      }

      if (data.needsApplication) {
        setGateNeedsApplication(true);
        setUnlocked(false);
        if (data.form) setForm(data.form);
        if (data.title) setTitle(data.title);
        return;
      }

      if (data.ok) {
        applySessionSuccess(data);
      } else {
        setLoadError(data.error || "Could not unlock manuscript.");
      }
    } catch {
      setLoadError("Could not load manuscript.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / projectId only; avoid refetch on chapter URL changes
  }, [projectId, initialChapterId, router]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const reportProgress = useCallback(
    (chapterId: string, percent: number) => {
      if (!unlocked || !chapterId || dnf) return;
      const pct = Math.max(0, Math.min(100, Math.round(percent)));
      if (pct < lastSentPercent.current && pct < 100) return;
      if (Math.abs(pct - lastSentPercent.current) < 3 && pct < 100) return;
      lastSentPercent.current = pct;
      void fetch(`/api/beta/session/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "progress", chapterId, percent: pct }),
      });
    },
    [unlocked, projectId, dnf]
  );

  useEffect(() => {
    if (!unlocked) return;
    lastSentPercent.current = 0;
    if (!active || dnf) return;
    reportProgress(active, 1);

    function measure() {
      const el = articleRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = Math.max(1, rect.height);
      const seen = Math.min(total, Math.max(0, vh - rect.top));
      const pct = Math.round((seen / total) * 100);
      if (progressTimer.current) clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(() => reportProgress(active, pct), 400);
    }

    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, [unlocked, active, dnf, reportProgress]);

  useEffect(() => {
    if (!unlocked) return;
    if (initialChapterId && chapters.some((c) => c.id === initialChapterId)) return;
    try {
      const stored = localStorage.getItem(chapterStorageKey(projectId));
      if (stored && chapters.some((c) => c.id === stored)) {
        setActive(stored);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, projectId, chapters]);

  const selectChapter = useCallback(
    (id: string) => {
      if (!id) return;
      setActive(id);
      setPop(null);
      setPopBody("");
      try {
        localStorage.setItem(chapterStorageKey(projectId), id);
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("chapter", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [projectId, searchParams, pathname, router]
  );

  useEffect(() => {
    if (!unlocked || !active) return;
    if (searchParams.get("chapter") === active) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("chapter", active);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, active]);

  const showPromptFromSelection = useCallback(() => {
    if (composingRef.current || pointingRef.current) return;
    const text = selectionInNode(articleRef.current);
    const rect = selectionRect();
    if (!text || text.length < 2 || !rect) return;
    const pos = clampPop(rect, 48);
    setPop((prev) => {
      if (prev?.composing) return prev;
      if (
        prev &&
        !prev.composing &&
        prev.excerpt === text.slice(0, 2000) &&
        Math.abs(prev.left - pos.left) < 2 &&
        Math.abs(prev.top - pos.top) < 2
      ) {
        return prev;
      }
      return {
        excerpt: text.slice(0, 2000),
        left: pos.left,
        top: pos.top,
        composing: false,
      };
    });
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    function idleDelay() {
      return window.matchMedia("(pointer: coarse)").matches ? 1100 : 450;
    }
    function schedule() {
      if (composingRef.current || pointingRef.current) return;
      if (delayRef.current) clearTimeout(delayRef.current);
      delayRef.current = setTimeout(showPromptFromSelection, idleDelay());
    }
    function onSelectionChange() {
      if (composingRef.current || pointingRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      if (!selectionInNode(articleRef.current)) return;
      if (delayRef.current) clearTimeout(delayRef.current);
      delayRef.current = setTimeout(showPromptFromSelection, idleDelay());
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-beta-comment-pop]")) return;
      if (articleRef.current?.contains(t)) {
        pointingRef.current = true;
        if (delayRef.current) clearTimeout(delayRef.current);
        return;
      }
      setPop(null);
      setPopBody("");
      setPopMsg("");
    }
    function onPointerUp() {
      pointingRef.current = false;
      schedule();
    }
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      if (delayRef.current) clearTimeout(delayRef.current);
    };
  }, [unlocked, showPromptFromSelection]);

  useEffect(() => {
    if (!unlocked) return;
    function reposition() {
      if (!pop || pop.composing) return;
      const rect = selectionRect();
      if (!rect) return;
      const pos = clampPop(rect, 48);
      setPop((p) => (p && !p.composing ? { ...p, left: pos.left, top: pos.top } : p));
    }
    const vv = window.visualViewport;
    vv?.addEventListener("resize", reposition);
    vv?.addEventListener("scroll", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      vv?.removeEventListener("resize", reposition);
      vv?.removeEventListener("scroll", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [unlocked, pop]);

  async function submitApplication(e: React.FormEvent) {
    e.preventDefault();
    setUnlockBusy(true);
    setUnlockMsg("");
    try {
      const res = await fetch(`/api/beta/session/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete_application",
          answers,
          displayName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setUnlockMsg(data.error || data.message || "Could not submit application.");
        return;
      }
      await loadSession();
    } catch {
      setUnlockMsg("Could not submit application.");
    } finally {
      setUnlockBusy(false);
    }
  }

  const chapter = chapters.find((c) => c.id === active);
  const chapterIndex = chapters.findIndex((c) => c.id === active);
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;
  const isLastChapter =
    chapters.length > 0 && chapterIndex === chapters.length - 1;

  function goToChapter(id: string) {
    selectChapter(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openComposer() {
    const rect = selectionRect();
    setPop((p) => {
      if (!p) return p;
      const pos = rect ? clampPop(rect, 280) : { left: p.left, top: p.top };
      return { ...p, ...pos, composing: true };
    });
    setPopBody("");
    setPopMsg("");
  }

  async function sendComment(body: string, excerpt?: string) {
    const text = body.trim();
    if (!text) return false;
    setSending(true);
    try {
      const res = await fetch("/api/beta/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          projectId,
          chapterId: active,
          text,
          excerpt: excerpt || undefined,
        }),
      });
      return res.ok;
    } finally {
      setSending(false);
    }
  }

  async function submitHighlight() {
    const ok = await sendComment(popBody, pop?.excerpt);
    if (ok) {
      setPop(null);
      setPopBody("");
      window.getSelection()?.removeAllRanges();
      setGeneralMsg("Comment on that passage sent. Thank you.");
    } else {
      setPopMsg("Failed to send.");
    }
  }

  async function submitGeneral() {
    const ok = await sendComment(generalBody);
    if (ok) {
      setGeneralBody("");
      setGeneralMsg("Comment sent. Thank you.");
    } else {
      setGeneralMsg("Failed to send.");
    }
  }

  async function submitDnf() {
    setDnfBusy(true);
    setDnfMsg("");
    try {
      const res = await fetch("/api/beta/dnf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, reason: dnfReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDnfMsg(data.error || "Could not save DNF.");
        return;
      }
      setDnf(true);
      setDnfOpen(false);
      setDnfReason("");
    } finally {
      setDnfBusy(false);
    }
  }

  async function submitFinish() {
    setFinishBusy(true);
    setFinishMsg("");
    try {
      const res = await fetch(`/api/beta/session/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", review: reviewBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFinishMsg(data.error || "Could not save review.");
        setFinishChecked(false);
        return;
      }
      setFinished(true);
      setFinishChecked(true);
      setFinishOpen(false);
    } finally {
      setFinishBusy(false);
    }
  }

  if (loading) {
    return <p className="font-ui mt-8 text-sm text-muted">Checking access…</p>;
  }

  if (loadError) {
    return (
      <div className="font-ui mt-8 space-y-3">
        <p className="text-sm text-muted">{loadError}</p>
        <Link href="/beta/dashboard" className="text-sm text-accent underline">
          Dashboard
        </Link>
      </div>
    );
  }

  if (gateNeedsApplication && !unlocked) {
    return (
      <form onSubmit={(e) => void submitApplication(e)} className="font-ui mt-8 space-y-4">
        <Link href="/beta/dashboard" className="text-sm text-accent underline">
          Dashboard
        </Link>
        <h2 className="font-display text-xl">Complete the application</h2>
        {title ? <p className="text-sm text-muted">For {title}</p> : null}
        <p className="text-sm text-muted">
          Fill this out once to unlock the manuscript. Your account email is already linked to this
          invite.
        </p>
        <BetaFormFields
          form={form}
          showEmail={false}
          displayName={displayName}
          onDisplayNameChange={setDisplayName}
          answers={answers}
          onAnswersChange={setAnswers}
        />
        <button
          type="submit"
          disabled={unlockBusy}
          className="bg-accent px-4 py-2 text-paper disabled:opacity-50"
        >
          {unlockBusy ? "Submitting…" : "Continue"}
        </button>
        {unlockMsg && <p className="text-sm text-muted">{unlockMsg}</p>}
      </form>
    );
  }

  if (!unlocked) {
    return <p className="font-ui mt-8 text-sm text-muted">Loading…</p>;
  }

  const popEl =
    pop && mounted
      ? createPortal(
          <div
            data-beta-comment-pop
            className="font-ui fixed z-[100] w-[min(22.5rem,calc(100vw-1rem))] border border-line bg-paper shadow-lg"
            style={{ left: pop.left, top: pop.top }}
          >
            {pop.composing ? (
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted">On this passage</p>
                  <button
                    type="button"
                    className="text-[10px] text-muted hover:text-ink"
                    onClick={() => {
                      setPop(null);
                      setPopBody("");
                    }}
                  >
                    Close
                  </button>
                </div>
                <p className="mt-1 line-clamp-4 text-sm italic text-ink">“{pop.excerpt}”</p>
                <textarea
                  className="mt-2 w-full border border-line p-2 text-sm"
                  rows={3}
                  value={popBody}
                  onChange={(e) => setPopBody(e.target.value)}
                  placeholder="Love this! / constructive note…"
                />
                <button
                  type="button"
                  disabled={sending || !popBody.trim()}
                  onClick={() => void submitHighlight()}
                  className="mt-2 bg-accent px-3 py-2 text-sm text-paper disabled:opacity-40"
                >
                  {sending ? "Sending…" : "Send comment"}
                </button>
                {popMsg && <p className="mt-1 text-xs text-muted">{popMsg}</p>}
              </div>
            ) : (
              <button
                type="button"
                className="w-full px-3 py-2.5 text-sm hover:bg-paper-deep/50"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  composingRef.current = true;
                }}
                onClick={openComposer}
              >
                Comment on this
              </button>
            )}
          </div>,
          document.body
        )
      : null;

  const finishSection = (
    <div className="font-ui border-t border-line pt-6">
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={finishChecked}
          disabled={finished}
          onChange={(e) => {
            if (finished) return;
            if (e.target.checked) {
              setFinishChecked(true);
              setFinishOpen(true);
              setFinishMsg("");
            } else {
              setFinishChecked(false);
            }
          }}
        />
        <span>
          <span className="font-medium text-ink">Finished the book?</span>
          <span className="mt-0.5 block text-xs text-muted">
            {finished
              ? "Your review is saved. It appears publicly while this book is ready for beta readers."
              : "Leave a short review. It appears publicly while this book is ready for beta readers."}
          </span>
        </span>
      </label>
    </div>
  );

  return (
    <div className="mt-8">
      <div className="font-ui mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/beta/dashboard" className="text-sm text-accent underline">
          Dashboard
        </Link>
        {title ? <p className="text-sm text-muted">{title}</p> : null}
      </div>

      {dnf && (
        <div className="font-ui mb-6 border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger">
          You’ve marked this manuscript DNF. The author can see your reason. Reading is still
          available if you want to continue privately.
        </div>
      )}

      <label className="font-ui block text-[10px] uppercase tracking-wide text-muted">
        Chapter
        <select
          className="mt-1 block w-full border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          value={active}
          onChange={(e) => goToChapter(e.target.value)}
        >
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>

      <p className="font-ui mt-4 text-xs text-muted">
        Select the passage first (on phones, drag the handles), then tap Comment on this. General
        notes still go at the bottom.
      </p>

      <h2 className="font-display mt-6 text-2xl">{chapter?.title || "Chapter"}</h2>
      <BetaManuscript
        html={chapter?.content_html || "<p>Empty</p>"}
        articleRef={articleRef}
      />
      {popEl}

      <div className="font-ui mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-6">
        <button
          type="button"
          disabled={!prevChapter}
          onClick={() => prevChapter && goToChapter(prevChapter.id)}
          className="border border-line px-4 py-2 text-sm disabled:opacity-30"
        >
          ← Previous chapter
        </button>
        <button
          type="button"
          disabled={!nextChapter}
          onClick={() => nextChapter && goToChapter(nextChapter.id)}
          className="border border-line px-4 py-2 text-sm disabled:opacity-30"
        >
          Next chapter →
        </button>
      </div>

      <div className="font-ui mt-8 border-t border-line pt-6">
        <h3 className="font-display text-xl">Leave feedback</h3>
        <p className="mt-1 text-xs text-muted">
          Whole-chapter notes for {chapter?.title || "this chapter"}. Highlight text above to comment
          on a specific sentence.
        </p>
        <textarea
          className="mt-2 w-full border border-line p-3"
          rows={4}
          value={generalBody}
          onChange={(e) => setGeneralBody(e.target.value)}
          placeholder="What worked? What confused you?"
        />
        <button
          type="button"
          disabled={sending || !generalBody.trim()}
          onClick={() => void submitGeneral()}
          className="mt-2 bg-accent px-4 py-2 text-paper disabled:opacity-40"
        >
          Send comment
        </button>
        {generalMsg && <p className="mt-2 text-sm text-muted">{generalMsg}</p>}
      </div>

      <div className="font-ui mt-10 border-t border-line pt-6">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={dnf}
            disabled={dnf}
            onChange={(e) => {
              if (e.target.checked) setDnfOpen(true);
            }}
          />
          <span>
            <span className="font-medium text-danger">DNF</span>
            <span className="mt-0.5 block text-xs text-muted">
              Mark if you’re stopping this beta read. The author will see your reason in red.
            </span>
          </span>
        </label>
      </div>

      {(isLastChapter || finished) && <div className="mt-10">{finishSection}</div>}

      {!isLastChapter && !finished && (
        <div className="font-ui sticky bottom-0 z-10 mt-10 border-t border-line bg-paper/95 py-4 backdrop-blur-sm">
          {finishSection}
        </div>
      )}

      {dnfOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/40 p-4 sm:items-center">
            <div
              role="dialog"
              aria-label="DNF reason"
              className="font-ui w-full max-w-md border border-line bg-paper p-4 shadow-lg"
            >
              <h3 className="font-display text-xl text-danger">Mark as DNF?</h3>
              <p className="mt-2 text-sm text-muted">
                Tell the author why you’re stopping. This can’t be undone from here.
              </p>
              <textarea
                className="mt-3 w-full border border-line p-2 text-sm"
                rows={4}
                value={dnfReason}
                onChange={(e) => setDnfReason(e.target.value)}
                placeholder="Why are you marking this DNF?"
                autoFocus
              />
              {dnfMsg && <p className="mt-2 text-xs text-danger">{dnfMsg}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="border border-line px-3 py-2 text-sm"
                  onClick={() => {
                    setDnfOpen(false);
                    setDnfReason("");
                    setDnfMsg("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={dnfBusy || !dnfReason.trim()}
                  className="bg-danger px-3 py-2 text-sm text-paper disabled:opacity-40"
                  onClick={() => void submitDnf()}
                >
                  {dnfBusy ? "Saving…" : "Confirm DNF"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {finishOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/40 p-4 sm:items-center">
            <div
              role="dialog"
              aria-label="Finish book review"
              className="font-ui w-full max-w-md border border-line bg-paper p-4 shadow-lg"
            >
              <h3 className="font-display text-xl">Finished the book?</h3>
              <p className="mt-2 text-sm text-muted">
                Your review appears publicly while this book is ready for beta readers.
              </p>
              <textarea
                className="mt-3 w-full border border-line p-2 text-sm"
                rows={5}
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                placeholder="What did you think overall?"
                autoFocus
              />
              {finishMsg && <p className="mt-2 text-xs text-danger">{finishMsg}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="border border-line px-3 py-2 text-sm"
                  onClick={() => {
                    setFinishOpen(false);
                    setFinishChecked(false);
                    setFinishMsg("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={finishBusy || !reviewBody.trim()}
                  className="bg-accent px-3 py-2 text-sm text-paper disabled:opacity-40"
                  onClick={() => void submitFinish()}
                >
                  {finishBusy ? "Saving…" : "Submit review"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

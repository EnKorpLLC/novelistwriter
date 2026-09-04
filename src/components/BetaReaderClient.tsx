"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function chapterStorageKey(token: string) {
  return `nw_beta_chapter_${token}`;
}

function sessionStorageKey(token: string) {
  return `nw_beta_session_${token}`;
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

export function BetaReaderClient({
  token,
  projectId,
  form,
  needsApplication: needsApplicationProp,
  initialChapterId,
}: {
  token: string;
  projectId: string;
  form: BetaApplicationForm;
  needsApplication: boolean;
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

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockChecking, setUnlockChecking] = useState(true);
  const [gateNeedsApplication, setGateNeedsApplication] = useState(needsApplicationProp);
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockMsg, setUnlockMsg] = useState("");

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

  composingRef.current = pop?.composing ?? false;

  useEffect(() => {
    setMounted(true);
  }, []);

  const applyUnlockSuccess = useCallback(
    (data: { chapters?: Chapter[]; status?: string }) => {
      const list = Array.isArray(data.chapters) ? data.chapters : [];
      setChapters(list);
      setUnlocked(true);
      setGateNeedsApplication(false);
      if (data.status === "dnf") setDnf(true);

      const preferred = initialChapterId || searchParams.get("chapter");
      let id =
        preferred && list.some((c) => c.id === preferred) ? preferred : list[0]?.id || "";
      if (!preferred || !list.some((c) => c.id === preferred)) {
        try {
          const stored = localStorage.getItem(chapterStorageKey(token));
          if (stored && list.some((c) => c.id === stored)) id = stored;
        } catch {
          /* ignore */
        }
      }
      setActive(id);
    },
    [initialChapterId, searchParams, token]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let storedEmail = "";
      try {
        storedEmail = sessionStorage.getItem(sessionStorageKey(token)) || "";
      } catch {
        /* ignore */
      }

      if (!storedEmail) {
        if (!cancelled) setUnlockChecking(false);
        return;
      }

      setEmail(storedEmail);
      try {
        const res = await fetch("/api/beta/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, email: storedEmail }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.ok) {
          applyUnlockSuccess(data);
        } else {
          try {
            sessionStorage.removeItem(sessionStorageKey(token));
          } catch {
            /* ignore */
          }
          if (data.needsApplication) setGateNeedsApplication(true);
        }
      } catch {
        if (!cancelled) {
          try {
            sessionStorage.removeItem(sessionStorageKey(token));
          } catch {
            /* ignore */
          }
        }
      } finally {
        if (!cancelled) setUnlockChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, applyUnlockSuccess]);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/beta/progress?token=${encodeURIComponent(token)}&projectId=${encodeURIComponent(projectId)}`
        );
        const data = await res.json();
        if (cancelled || !res.ok) return;
        if (data.status === "dnf") setDnf(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked, token, projectId]);

  const reportProgress = useCallback(
    (chapterId: string, percent: number) => {
      if (!unlocked || !chapterId || dnf) return;
      const pct = Math.max(0, Math.min(100, Math.round(percent)));
      if (pct < lastSentPercent.current && pct < 100) return;
      if (Math.abs(pct - lastSentPercent.current) < 3 && pct < 100) return;
      lastSentPercent.current = pct;
      void fetch("/api/beta/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, projectId, chapterId, percent: pct }),
      });
    },
    [unlocked, token, projectId, dnf]
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
      // How much of the article has scrolled into / past the viewport
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
      const stored = localStorage.getItem(chapterStorageKey(token));
      if (stored && chapters.some((c) => c.id === stored)) {
        setActive(stored);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, token, chapters]);

  const selectChapter = useCallback(
    (id: string) => {
      if (!id) return;
      setActive(id);
      setPop(null);
      setPopBody("");
      try {
        localStorage.setItem(chapterStorageKey(token), id);
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("chapter", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [token, searchParams, pathname, router]
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
    // Empty selection: keep an existing chip (re-render must not make it vanish)
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
      // User is still dragging native handles — wait until they pause
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

  async function submitUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlockBusy(true);
    setUnlockMsg("");
    try {
      const res = await fetch("/api/beta/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email,
          ...(gateNeedsApplication ? { answers } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.needsApplication) setGateNeedsApplication(true);
        setUnlockMsg(data.error || "Could not unlock manuscript.");
        return;
      }
      try {
        sessionStorage.setItem(sessionStorageKey(token), email.trim().toLowerCase());
      } catch {
        /* ignore */
      }
      applyUnlockSuccess(data);
    } catch {
      setUnlockMsg("Could not unlock manuscript.");
    } finally {
      setUnlockBusy(false);
    }
  }

  const chapter = chapters.find((c) => c.id === active);
  const chapterIndex = chapters.findIndex((c) => c.id === active);
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;

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
      const res = await fetch("/api/beta/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          projectId,
          chapterId: active,
          body: text,
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
        body: JSON.stringify({ token, projectId, reason: dnfReason }),
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

  if (unlockChecking) {
    return <p className="font-ui mt-8 text-sm text-muted">Checking access…</p>;
  }

  if (!unlocked) {
    return (
      <form onSubmit={(e) => void submitUnlock(e)} className="font-ui mt-8 space-y-4">
        <h2 className="font-display text-xl">
          {gateNeedsApplication ? "Complete the application" : "Confirm your email"}
        </h2>
        <p className="text-sm text-muted">
          {gateNeedsApplication
            ? "Fill this out once with the email on your invite. Later visits only need that email again."
            : "Enter the email on this invite to unlock the manuscript. You’ll need it again if you leave and come back later."}
        </p>
        {gateNeedsApplication ? (
          <BetaFormFields
            form={form}
            email={email}
            onEmailChange={setEmail}
            answers={answers}
            onAnswersChange={setAnswers}
          />
        ) : (
          <label className="block text-sm">
            <span className="text-[10px] uppercase tracking-wide text-muted">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={unlockBusy || !email.trim()}
          className="bg-accent px-4 py-2 text-paper disabled:opacity-50"
        >
          {unlockBusy ? "Unlocking…" : "Continue"}
        </button>
        {unlockMsg && <p className="text-sm text-muted">{unlockMsg}</p>}
      </form>
    );
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

  return (
    <div className="mt-8">
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
    </div>
  );
}

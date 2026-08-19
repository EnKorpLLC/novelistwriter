"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

function storageKey(token: string) {
  return `nw_beta_chapter_${token}`;
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
  const top =
    below + height < vh - 8 ? below + oy : Math.max(8 + oy, above + oy);
  return { left, top };
}

export function BetaReaderClient({
  token,
  projectId,
  chapters,
  initialChapterId,
}: {
  token: string;
  projectId: string;
  chapters: Chapter[];
  initialChapterId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const articleRef = useRef<HTMLElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveId = useCallback(
    (preferred?: string | null) => {
      if (preferred && chapters.some((c) => c.id === preferred)) return preferred;
      return chapters[0]?.id || "";
    },
    [chapters]
  );

  const [active, setActive] = useState(() =>
    resolveId(initialChapterId || searchParams.get("chapter"))
  );
  const [generalBody, setGeneralBody] = useState("");
  const [generalMsg, setGeneralMsg] = useState("");
  const [pop, setPop] = useState<HighlightPop | null>(null);
  const [popBody, setPopBody] = useState("");
  const [popMsg, setPopMsg] = useState("");
  const [sending, setSending] = useState(false);

  composingRef.current = pop?.composing ?? false;

  // Restore from localStorage if URL had no valid chapter
  useEffect(() => {
    if (initialChapterId && chapters.some((c) => c.id === initialChapterId)) return;
    try {
      const stored = localStorage.getItem(storageKey(token));
      if (stored && chapters.some((c) => c.id === stored)) {
        setActive(stored);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const selectChapter = useCallback(
    (id: string) => {
      if (!id) return;
      setActive(id);
      setPop(null);
      setPopBody("");
      try {
        localStorage.setItem(storageKey(token), id);
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
    if (!active) return;
    if (searchParams.get("chapter") === active) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("chapter", active);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const showPromptFromSelection = useCallback(() => {
    if (composingRef.current) return;
    const text = selectionInNode(articleRef.current);
    const rect = selectionRect();
    if (!text || text.length < 2 || !rect) {
      setPop((p) => (p?.composing ? p : null));
      return;
    }
    const pos = clampPop(rect, 48);
    setPop({
      excerpt: text.slice(0, 2000),
      left: pos.left,
      top: pos.top,
      composing: false,
    });
  }, []);

  useEffect(() => {
    function schedule() {
      if (composingRef.current) return;
      if (delayRef.current) clearTimeout(delayRef.current);
      // iOS finishes the selection after the handles settle
      delayRef.current = setTimeout(showPromptFromSelection, 350);
    }
    function onSelectionChange() {
      if (composingRef.current) return;
      if (!articleRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        // Don't hide while the user is tapping the comment chip
        return;
      }
      schedule();
    }
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("mouseup", schedule);
    document.addEventListener("touchend", schedule, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mouseup", schedule);
      document.removeEventListener("touchend", schedule);
      if (delayRef.current) clearTimeout(delayRef.current);
    };
  }, [showPromptFromSelection]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-beta-comment-pop]")) return;
      if (composingRef.current) {
        setPop(null);
        setPopBody("");
        setPopMsg("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    function reposition() {
      if (!pop) return;
      const rect = selectionRect();
      if (!rect) return;
      const pos = clampPop(rect, pop.composing ? 280 : 48);
      setPop((p) => (p ? { ...p, left: pos.left, top: pos.top } : p));
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
  }, [pop]);

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

  return (
    <div className="mt-8">
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
        Highlight a sentence, then tap Comment — a popup stays on that spot. General notes still go
        at the bottom.
      </p>

      <h2 className="font-display mt-6 text-2xl">{chapter?.title || "Chapter"}</h2>
      <article
        ref={articleRef}
        className="manuscript-prose mt-4 max-w-none"
        dangerouslySetInnerHTML={{ __html: chapter?.content_html || "<p>Empty</p>" }}
      />

      {pop && (
        <div
          ref={popRef}
          data-beta-comment-pop
          className="font-ui fixed z-[100] w-[min(22.5rem,calc(100vw-1rem))] border border-line bg-paper shadow-lg"
          style={{ left: pop.left, top: pop.top }}
          onPointerDown={(e) => e.stopPropagation()}
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
                composingRef.current = true;
              }}
              onClick={openComposer}
            >
              Comment on this
            </button>
          )}
        </div>
      )}

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
    </div>
  );
}

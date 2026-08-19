"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Chapter = {
  id: string;
  title: string;
  content_html: string;
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
  const commentRef = useRef<HTMLTextAreaElement>(null);

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
  const [body, setBody] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [msg, setMsg] = useState("");
  const [pop, setPop] = useState<{ x: number; y: number; text: string } | null>(null);

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
      setExcerpt("");
      setPop(null);
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

  // Keep URL in sync when we restored from storage
  useEffect(() => {
    if (!active) return;
    if (searchParams.get("chapter") === active) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("chapter", active);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-beta-comment-pop]")) return;
      if (articleRef.current?.contains(t)) return;
      setPop(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const chapter = chapters.find((c) => c.id === active);
  const chapterIndex = chapters.findIndex((c) => c.id === active);
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;

  function goToChapter(id: string) {
    selectChapter(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function captureSelection() {
    const text = selectionInNode(articleRef.current);
    if (!text || text.length < 2) {
      setPop(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setPop({
      x: Math.min(window.innerWidth - 160, Math.max(8, rect.left + rect.width / 2 - 70)),
      y: Math.max(8, rect.top - 44),
      text: text.slice(0, 2000),
    });
  }

  function commentOnSelection(text: string) {
    setExcerpt(text);
    setPop(null);
    window.getSelection()?.removeAllRanges();
    commentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => commentRef.current?.focus(), 200);
  }

  async function submit() {
    const res = await fetch("/api/beta/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        projectId,
        chapterId: active,
        body,
        excerpt: excerpt || undefined,
      }),
    });
    if (res.ok) {
      setBody("");
      setExcerpt("");
      setMsg(excerpt ? "Comment on that passage sent. Thank you." : "Comment sent. Thank you.");
    } else {
      setMsg("Failed to send.");
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
        Highlight a sentence to comment on it, or leave general feedback at the bottom.
      </p>

      <h2 className="font-display mt-6 text-2xl">{chapter?.title || "Chapter"}</h2>
      <article
        ref={articleRef}
        className="manuscript-prose mt-4 max-w-none select-text"
        onMouseUp={captureSelection}
        onTouchEnd={() => window.setTimeout(captureSelection, 50)}
        dangerouslySetInnerHTML={{ __html: chapter?.content_html || "<p>Empty</p>" }}
      />

      {pop && (
        <button
          type="button"
          data-beta-comment-pop
          className="font-ui fixed z-50 border border-line bg-paper px-3 py-1.5 text-xs shadow-md hover:border-accent"
          style={{ left: pop.x, top: pop.y }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => commentOnSelection(pop.text)}
        >
          Comment on this
        </button>
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
          Feedback is for {chapter?.title || "this chapter"}. The author sees it in the Beta tab.
        </p>
        {excerpt ? (
          <div className="mt-3 border-l-2 border-accent bg-paper-deep/40 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wide text-muted">On this passage</p>
              <button
                type="button"
                className="text-[10px] text-muted hover:text-ink"
                onClick={() => setExcerpt("")}
              >
                Clear
              </button>
            </div>
            <p className="mt-1 text-sm italic text-ink">“{excerpt}”</p>
          </div>
        ) : null}
        <textarea
          ref={commentRef}
          className="mt-2 w-full border border-line p-3"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            excerpt
              ? "Love this! / constructive note on the highlighted sentence…"
              : "What worked? What confused you?"
          }
        />
        <button type="button" onClick={submit} className="mt-2 bg-accent px-4 py-2 text-paper">
          Send comment
        </button>
        {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
      </div>
    </div>
  );
}

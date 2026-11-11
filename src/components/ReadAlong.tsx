"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Chapter = { title: string; blocks: { html: string; chars: number }[]; audio: { fileIndex: number; url: string; durationMs: number } | null };
type Saved = { fileIndex: number; positionMs: number; speed: number; updatedAt?: string };

const SPEEDS = [0.8, 1, 1.2, 1.5, 1.75, 2];
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Read and listen: the book's text with its audiobook. Tap a paragraph to listen from there; while listening, the
 * paragraph being read is highlighted and followed. Shares its place with the audiobook player.
 */
export function ReadAlong({ projectId, storageKey, chapters, signedIn, title, author }: { projectId: string; storageKey: string; chapters: Chapter[]; signedIn: boolean; title: string; author: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const blockEls = useRef<(HTMLDivElement | null)[]>([]);
  const [ch, setCh] = useState(0);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const seekTo = useRef<number | null>(null);
  const lastSave = useRef(0);
  const local = `nw-listen-${storageKey}`;
  const chapter = chapters[ch];

  // Where each paragraph starts, as a share of the chapter's text (and so of its audio)
  const starts = useMemo(() => {
    const total = chapter.blocks.reduce((n, b) => n + b.chars, 0) || 1;
    let acc = 0;
    return chapter.blocks.map((b) => {
      const s = acc / total;
      acc += b.chars;
      return s;
    });
  }, [chapter]);
  const msForBlock = (i: number) => (chapter.audio ? starts[i] * chapter.audio.durationMs : 0);
  const blockAt = (ms: number) => {
    if (!chapter.audio) return -1;
    const f = ms / chapter.audio.durationMs;
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= f) i++;
    return i;
  };
  const current = playing || pos > 0 ? blockAt(pos * 1000) : -1;

  const save = useCallback(
    (fileIndex: number, ms: number) => {
      const body: Saved = { fileIndex, positionMs: Math.round(ms), speed, updatedAt: new Date().toISOString() };
      try {
        localStorage.setItem(local, JSON.stringify(body));
      } catch {
        /* private mode */
      }
      if (signedIn) void fetch("/api/library/listen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, ...body }) }).catch(() => null);
    },
    [local, projectId, signedIn, speed]
  );

  // Open at the saved place (from listening or reading), on the right chapter and paragraph
  useEffect(() => {
    void (async () => {
      let saved: Saved | null = null;
      try {
        saved = JSON.parse(localStorage.getItem(local) || "null");
      } catch {
        saved = null;
      }
      if (signedIn) {
        const d = await fetch(`/api/library/listen?projectId=${projectId}`)
          .then((r) => r.json())
          .catch(() => null);
        const remote = d?.position as Saved | null;
        if (remote && (!saved?.updatedAt || (remote.updatedAt && remote.updatedAt > saved.updatedAt))) saved = remote;
      }
      if (!saved) return;
      const i = chapters.findIndex((c) => c.audio?.fileIndex === saved!.fileIndex);
      if (i < 0) return;
      setCh(i);
      setSpeed(saved.speed || 1);
      seekTo.current = saved.positionMs / 1000;
      setPos(saved.positionMs / 1000);
      setNote(`Opened at your place in ${chapters[i].title}`);
      setTimeout(() => {
        const c = chapters[i];
        if (!c.audio) return;
        const f = saved!.positionMs / c.audio.durationMs;
        const total = c.blocks.reduce((n, b) => n + b.chars, 0) || 1;
        let acc = 0;
        let k = 0;
        for (; k < c.blocks.length; k++) {
          if ((acc + c.blocks[k].chars) / total > f) break;
          acc += c.blocks[k].chars;
        }
        blockEls.current[Math.min(k, c.blocks.length - 1)]?.scrollIntoView({ block: "center" });
      }, 300);
    })();
  }, [chapters, local, projectId, signedIn]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed, ch]);
  useEffect(() => {
    if (follow && playing && current >= 0) blockEls.current[current]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current, follow, playing]);

  // Reading without the audio still keeps your place: the paragraph at the top of the screen
  useEffect(() => {
    if (playing || !chapter.audio) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const i = blockEls.current.findIndex((el) => el && el.getBoundingClientRect().bottom > 90);
        if (i >= 0 && chapter.audio) save(chapter.audio.fileIndex, msForBlock(i));
      }, 1500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ch, save]);

  function openChapter(i: number, at = 0, play = false) {
    setCh(i);
    setPicked(null);
    seekTo.current = at;
    setPos(at);
    window.scrollTo({ top: 0 });
    if (play) setTimeout(() => void audio.current?.play().catch(() => null), 80);
  }

  function listenFrom(i: number) {
    if (!chapter.audio || !audio.current) return;
    audio.current.currentTime = msForBlock(i) / 1000;
    setPicked(null);
    void audio.current.play().catch(() => null);
  }

  return (
    <div className="pb-28">
      <div className="font-ui flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 text-sm">
        <span className="text-muted">
          {title} · {author}
        </span>
        <select value={ch} onChange={(e) => openChapter(Number(e.target.value), 0, playing)} className="max-w-full border border-line bg-paper px-2 py-1 text-xs" aria-label="Chapter">
          {chapters.map((c, i) => (
            <option key={i} value={i}>
              {i + 1}. {c.title}
            </option>
          ))}
        </select>
      </div>
      {note && <p className="font-ui mt-2 text-xs text-accent">{note}</p>}

      <article className="mx-auto mt-6 max-w-[36rem] font-display text-lg leading-relaxed">
        <h2 className="mb-6 text-center text-2xl">{chapter.title}</h2>
        {chapter.blocks.map((b, i) => (
          <div
            key={`${ch}-${i}`}
            ref={(el) => {
              blockEls.current[i] = el;
            }}
            onClick={() => chapter.audio && setPicked(picked === i ? null : i)}
            className={`read-block mb-3 cursor-pointer rounded-sm px-1 transition-colors ${i === current && (playing || pos > 0) ? "bg-accent/15" : picked === i ? "bg-ink/5" : ""}`}
          >
            <div dangerouslySetInnerHTML={{ __html: b.html }} />
            {picked === i && (
              <button
                type="button"
                className="font-ui mt-1 bg-ink px-3 py-1 text-xs text-paper"
                onClick={(e) => {
                  e.stopPropagation();
                  listenFrom(i);
                }}
              >
                Listen from here
              </button>
            )}
          </div>
        ))}
        {ch + 1 < chapters.length && (
          <button type="button" className="font-ui mt-6 border border-line px-4 py-2 text-sm" onClick={() => openChapter(ch + 1, 0, playing)}>
            Next: {chapters[ch + 1].title}
          </button>
        )}
      </article>

      {/* The listening bar */}
      <div className="font-ui fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 py-2 backdrop-blur">
        {chapter.audio ? (
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 text-xs">
            <audio
              ref={audio}
              src={chapter.audio.url}
              preload="metadata"
              onLoadedMetadata={(e) => {
                e.currentTarget.playbackRate = speed;
                if (seekTo.current != null) {
                  e.currentTarget.currentTime = seekTo.current;
                  seekTo.current = null;
                }
              }}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                setPos(t);
                if (Date.now() - lastSave.current > 10_000) {
                  lastSave.current = Date.now();
                  save(chapter.audio!.fileIndex, t * 1000);
                }
              }}
              onPlay={() => setPlaying(true)}
              onPause={(e) => {
                setPlaying(false);
                save(chapter.audio!.fileIndex, e.currentTarget.currentTime * 1000);
              }}
              onEnded={() => {
                if (ch + 1 < chapters.length) openChapter(ch + 1, 0, true);
              }}
            />
            <button type="button" className="bg-ink px-4 py-2 text-paper" onClick={() => void (audio.current?.paused ? audio.current.play().catch(() => null) : audio.current?.pause())}>
              {playing ? "Pause" : current > 0 ? "Resume" : "Listen"}
            </button>
            <button type="button" className="border border-line px-2 py-2" onClick={() => audio.current && (audio.current.currentTime = Math.max(0, audio.current.currentTime - 15))} aria-label="Back 15 seconds">
              −15s
            </button>
            <span className="tabular-nums text-muted">
              {clock(pos * 1000)} / {clock(chapter.audio.durationMs)}
            </span>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="border border-line bg-paper px-1 py-1" aria-label="Speed">
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-muted">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow along
            </label>
            <span className="w-full text-[11px] text-muted sm:w-auto">Tap a paragraph to listen from there. Paragraph timing is approximate.</span>
          </div>
        ) : (
          <p className="mx-auto max-w-3xl text-xs text-muted">This chapter has no matching audio.</p>
        )}
      </div>
    </div>
  );
}

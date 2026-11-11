"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type File = { title: string; url: string; durationMs: number };
type Saved = { fileIndex: number; positionMs: number; speed: number; updatedAt?: string };

const SPEEDS = [0.8, 1, 1.2, 1.5, 1.75, 2];
const SLEEP = [
  { id: "off", label: "Off" },
  { id: "15", label: "15 min" },
  { id: "30", label: "30 min" },
  { id: "45", label: "45 min" },
  { id: "60", label: "1 hour" },
  { id: "chapter", label: "End of chapter" },
];
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The buyer's audiobook player: chapters, speed, a sleep timer, and lock-screen controls. Your place is saved to your
 * account when signed in (so it follows you across devices), or in this browser otherwise.
 */
export function AudiobookPlayer({ projectId, storageKey, files, signedIn, title, author, coverUrl }: { projectId: string; storageKey: string; files: File[]; signedIn: boolean; title: string; author: string; coverUrl: string | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [sleep, setSleep] = useState("off");
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const [resumed, setResumed] = useState<string | null>(null);
  const restore = useRef<number | null>(null);
  const lastSave = useRef(0);
  const local = `nw-listen-${storageKey}`;
  const total = files.reduce((n, f) => n + f.durationMs, 0);
  const before = files.slice(0, index).reduce((n, f) => n + f.durationMs, 0);

  const save = useCallback(
    (i: number, ms: number, s: number, finished = false) => {
      const body: Saved = { fileIndex: i, positionMs: Math.round(ms), speed: s, updatedAt: new Date().toISOString() };
      try {
        localStorage.setItem(local, JSON.stringify(body));
      } catch {
        /* private mode */
      }
      if (signedIn) void fetch("/api/library/listen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, ...body, finished }) }).catch(() => null);
    },
    [local, projectId, signedIn]
  );

  // Pick up where you left off: the account's place if it's newer than this browser's
  useEffect(() => {
    let cancelled = false;
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
      if (cancelled || !saved || saved.fileIndex >= files.length) return;
      if (saved.fileIndex === 0 && saved.positionMs < 5000) return;
      setIndex(saved.fileIndex);
      setSpeed(saved.speed || 1);
      restore.current = saved.positionMs / 1000;
      setResumed(`Picked up where you left off: ${files[saved.fileIndex]?.title}, ${clock(saved.positionMs)}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [files, local, projectId, signedIn]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed, index]);

  // Sleep timer: minutes from now, or at the end of this chapter (handled when it ends)
  useEffect(() => {
    if (sleep === "off" || sleep === "chapter") return setSleepAt(null);
    setSleepAt(Date.now() + Number(sleep) * 60_000);
  }, [sleep]);
  useEffect(() => {
    if (!sleepAt) return;
    const t = setInterval(() => {
      if (Date.now() >= sleepAt) {
        audio.current?.pause();
        setSleep("off");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [sleepAt]);

  const go = useCallback(
    (i: number, at = 0, autoplay = playing) => {
      if (i < 0 || i >= files.length) return;
      restore.current = at;
      setIndex(i);
      setPos(at);
      save(i, at * 1000, speed);
      if (autoplay) setTimeout(() => void audio.current?.play().catch(() => null), 50);
    },
    [files.length, playing, save, speed]
  );
  const toggle = () => void (audio.current?.paused ? audio.current.play().catch(() => null) : audio.current?.pause());
  const skip = (s: number) => {
    if (!audio.current) return;
    audio.current.currentTime = Math.max(0, Math.min(audio.current.duration || Infinity, audio.current.currentTime + s));
  };

  // Lock screen and headphone controls
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const f = files[index];
    navigator.mediaSession.metadata = new MediaMetadata({ title: f?.title || title, artist: author, album: title, artwork: coverUrl ? [{ src: coverUrl, sizes: "512x512" }] : [] });
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(a, h);
      } catch {
        /* not supported here */
      }
    };
    set("play", () => void audio.current?.play());
    set("pause", () => audio.current?.pause());
    set("seekbackward", () => skip(-15));
    set("seekforward", () => skip(30));
    set("previoustrack", () => go(index - 1, 0, true));
    set("nexttrack", () => go(index + 1, 0, true));
  });

  const f = files[index];
  return (
    <div className="font-ui border border-line p-4 text-sm">
      <audio
        ref={audio}
        src={f?.url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = speed;
          if (restore.current != null) {
            e.currentTarget.currentTime = restore.current;
            restore.current = null;
          }
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setPos(t);
          if (Date.now() - lastSave.current > 10_000) {
            lastSave.current = Date.now();
            save(index, t * 1000, speed);
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={(e) => {
          setPlaying(false);
          save(index, e.currentTarget.currentTime * 1000, speed);
        }}
        onEnded={() => {
          if (sleep === "chapter") {
            setSleep("off");
            setPlaying(false);
            if (index + 1 < files.length) go(index + 1, 0, false);
            return;
          }
          if (index + 1 < files.length) go(index + 1, 0, true);
          else save(index, 0, speed, true);
        }}
      />
      {resumed && <p className="mb-2 text-xs text-accent">{resumed}</p>}
      <p className="text-xs text-muted">
        Chapter {index + 1} of {files.length}
      </p>
      <p className="font-display text-xl">{f?.title}</p>
      <input
        type="range"
        min={0}
        max={(f?.durationMs || 1) / 1000}
        step={1}
        value={pos}
        onChange={(e) => audio.current && (audio.current.currentTime = Number(e.target.value))}
        aria-label="Position in the chapter"
        className="mt-2 w-full accent-[var(--accent)]"
      />
      <div className="flex justify-between text-xs tabular-nums text-muted">
        <span>{clock(pos * 1000)}</span>
        <span>
          {clock(before + pos * 1000)} of {clock(total)} · {clock((total - before - pos * 1000) / speed)} left at {speed}×
        </span>
        <span>-{clock((f?.durationMs || 0) - pos * 1000)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="border border-line px-3 py-2 disabled:opacity-40" onClick={() => go(index - 1, 0)} disabled={index === 0} aria-label="Previous chapter">
          ‹ Chapter
        </button>
        <button type="button" className="border border-line px-3 py-2" onClick={() => skip(-15)} aria-label="Back 15 seconds">
          −15s
        </button>
        <button type="button" className="bg-ink px-6 py-2 text-paper" onClick={toggle}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className="border border-line px-3 py-2" onClick={() => skip(30)} aria-label="Forward 30 seconds">
          +30s
        </button>
        <button type="button" className="border border-line px-3 py-2 disabled:opacity-40" onClick={() => go(index + 1, 0)} disabled={index >= files.length - 1} aria-label="Next chapter">
          Chapter ›
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs">
        <label className="flex items-center gap-1">
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="border border-line bg-paper px-1 py-1">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Sleep timer
          <select value={sleep} onChange={(e) => setSleep(e.target.value)} className="border border-line bg-paper px-1 py-1">
            {SLEEP.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {sleepAt && <span className="text-muted">Stops in {clock(sleepAt - Date.now())}</span>}
      </div>
      <ol className="mt-4 max-h-72 divide-y divide-line overflow-y-auto border-y border-line">
        {files.map((x, i) => (
          <li key={i}>
            <button type="button" onClick={() => go(i, 0, true)} className={`flex w-full items-center justify-between gap-2 px-1 py-2 text-left hover:bg-accent/10 ${i === index ? "text-accent" : ""}`}>
              <span>
                {i === index && playing ? "Playing · " : ""}
                {i + 1}. {x.title}
              </span>
              <span className="shrink-0 text-xs text-muted">{clock(x.durationMs)}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-muted">{signedIn ? "Your place is saved to your account, so you can pick up on any device." : "Your place is saved in this browser. Sign in to keep it across devices."}</p>
    </div>
  );
}

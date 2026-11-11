"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chapter } from "@/lib/types";
import { encodeWav, measure, roomAdvice, type Levels } from "@/lib/audio/wav";
import { Recorder, listMicrophones, openMicrophone } from "@/lib/audio/recorder";
import { allFiles, browserStore, chapterFolder, chooseFolder, deleteFile, forgetFolder, readFile, restoreFolder, saveFile, supportsFolders, type AudioStore } from "@/lib/audio/local-store";
import { readPcm, sentencesOf } from "@/lib/audio/assemble";
import { AudioReview, isPickup, placeTake, rangeLabel, type AudioNote, type ChapterReview, type RemoteCopy, type StudioTake } from "@/components/AudioReview";
import { AudioExport, creditsScripts, type AudioSettings, type AudioSlot } from "@/components/AudioExport";
import { coverPublicUrl } from "@/lib/cover";
import { NarratorPanel } from "@/components/NarratorPanel";

type Take = StudioTake & { chapterId: string; peakDb: number | null; rmsDb: number | null; imported: boolean; recordedBy?: string };
type RecordSummary = { sessions: number; recordedMs: number; takes: number; retakes: number; firstAt: string | null; lastAt: string | null };

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const hours = (ms: number) => (ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} hours` : `${Math.round(ms / 60000)} minutes`);
// A chapter held in memory grows about 6 MB a minute; past this, ask the narrator to split it
const LONG_TAKE_MS = 45 * 60_000;

/** Audio tab (Studio): record the audiobook chapter by chapter. Recordings stay on this computer. */
export function AudioStudio({ projectId, chapters, bookTitle, coverPath }: { projectId: string; chapters: Chapter[]; bookTitle: string; coverPath: string | null }) {
  const ordered = useMemo(() => [...chapters].sort((a, b) => a.sort_order - b.sort_order), [chapters]);
  const [settings, setSettings] = useState<AudioSettings>({ narrator: "", sampleChapterId: null, sampleSentence: 0 });
  const [authorName, setAuthorName] = useState("");
  const [exportHint, setExportHint] = useState<string | null>(null);
  // Who's using the studio: the author, or the narrator of the book's active job
  const [role, setRole] = useState<"owner" | "narrator">("owner");
  const [userId, setUserId] = useState<string | null>(null);
  const [narrator, setNarrator] = useState<{ name: string; jobId: string; checkpoint?: { required: boolean; status: "pending" | "submitted" | "approved" | "changes"; note: string | null } } | null>(null);
  const [reviewCopies, setReviewCopies] = useState<Record<string, RemoteCopy>>({});
  const [storageReady, setStorageReady] = useState(false);
  const scripts = creditsScripts({ title: bookTitle, author: authorName, narrator: settings.narrator || narrator?.name || "" });
  // Opening credits, the chapters, closing credits: everything that becomes a file
  const slots = useMemo<AudioSlot[]>(
    () => [
      ...(exportHint ? [] : [{ id: "opening", kind: "opening" as const, title: "Opening credits", content_text: scripts.opening, folder: "opening-credits" }]),
      ...ordered.map((c, i) => ({ id: c.id, kind: "chapter" as const, title: c.title?.trim() || `Chapter ${i + 1}`, content_text: c.content_text || "", folder: chapterFolder(i) })),
      ...(exportHint ? [] : [{ id: "closing", kind: "closing" as const, title: "Closing credits", content_text: scripts.closing, folder: "closing-credits" }]),
    ],
    [ordered, scripts.opening, scripts.closing, exportHint]
  );
  const [studio, setStudio] = useState<boolean | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [summary, setSummary] = useState<RecordSummary | null>(null);
  const [store, setStore] = useState<AudioStore | null>(null);
  const [reconnect, setReconnect] = useState<string | null>(null);
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]);
  const [micId, setMicId] = useState("");
  const [level, setLevel] = useState(-120);
  const [roomCheck, setRoomCheck] = useState<{ kind: "silence" | "voice"; levels: Levels } | null>(null);
  const [checking, setChecking] = useState<"silence" | "voice" | null>(null);
  const [chapterId, setChapterId] = useState(ordered[0]?.id || "");
  // What the next take covers: null for the whole chapter, or a pickup's lines (to = null for "to the end")
  const [range, setRange] = useState<{ from: number; to: number | null; noteId?: string } | null>(null);
  const fromSentence = range?.from ?? 0;
  const [mode, setMode] = useState<"record" | "review">("record");
  const [notes, setNotes] = useState<AudioNote[]>([]);
  const [reviews, setReviews] = useState<Record<string, ChapterReview>>({});
  const [reviewHint, setReviewHint] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [playLen, setPlayLen] = useState(0);
  const [micOn, setMicOn] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const sessionId = useRef<string | null>(null);
  const startedAt = useRef(0);

  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/audio`).catch(() => null);
    if (!r?.ok) return setStudio(false);
    const d = await r.json();
    setStudio(Boolean(d.studio));
    setHint(d.migrationNeeded ? d.error : null);
    setTakes(d.takes || []);
    setSummary(d.record || null);
    setNotes(d.notes || []);
    setReviews(d.chapters || {});
    setReviewHint(d.reviewHint || null);
    setExportHint(d.exportHint || null);
    if (d.settings) setSettings(d.settings);
    setAuthorName(d.authorName || "");
    setRole(d.role === "narrator" ? "narrator" : "owner");
    setUserId(d.userId || null);
    setNarrator(d.narrator || null);
    setReviewCopies(d.reviewCopies || {});
    setStorageReady(Boolean(d.storageReady));
    if (d.reviewCopiesHint) setReviewHint(d.reviewCopiesHint);
  }, [projectId]);

  useEffect(() => {
    void load();
    void restoreFolder(projectId).then((s) => {
      if (!s) return;
      if ("needsClick" in s) setReconnect(s.label);
      else setStore(s);
    });
  }, [load, projectId]);

  // Close the session and microphone when leaving; warn before losing a take in progress
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (recording) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recording]);
  useEffect(
    () => () => {
      if (sessionId.current) void post({ action: "end_session", id: sessionId.current });
      void recorder.current?.close();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => window.clearInterval(t);
  }, [recording]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch(`/api/projects/${projectId}/audio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Could not save");
    return d;
  }

  async function ensureMic(deviceId = micId) {
    if (recorder.current) return recorder.current;
    const s = await openMicrophone(deviceId || undefined);
    stream.current = s;
    const r = await Recorder.create(s);
    r.onLevel = (db) => setLevel(db);
    recorder.current = r;
    setMicOn(true);
    setMics(await listMicrophones().catch(() => []));
    return r;
  }

  async function closeMic() {
    await recorder.current?.close();
    stream.current?.getTracks().forEach((t) => t.stop());
    recorder.current = null;
    stream.current = null;
    setMicOn(false);
    setLevel(-120);
  }

  async function switchMic(id: string) {
    setMicId(id);
    await closeMic();
    await ensureMic(id).catch((e) => setNote(e instanceof Error ? e.message : "Couldn't open that microphone"));
  }

  async function runCheck(kind: "silence" | "voice") {
    setNote(null);
    try {
      const r = await ensureMic();
      setChecking(kind);
      const { samples, sampleRate } = await r.recordFor(5000);
      const levels = measure(samples, sampleRate);
      setRoomCheck({ kind, levels });
      // The silent room check doubles as this session's room tone, saved with the takes
      if (kind === "silence" && store) await saveFile(store, "room-tone", `room-tone-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.wav`, encodeWav(samples, sampleRate));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't use the microphone. Check that the browser is allowed to use it.");
    } finally {
      setChecking(null);
    }
  }

  const chapter = slots.find((s) => s.id === chapterId);
  const folder = chapter?.folder || "";
  const sentences = useMemo(() => sentencesOf(chapter?.content_text || ""), [chapter?.content_text]);
  const chapterTakes = takes.filter((t) => t.chapterId === chapterId).sort((a, b) => b.takeNo - a.takeNo);
  const chapterNotesOpen = notes.filter((n) => n.chapterId === chapterId && n.status === "open").length;

  async function startRecording() {
    if (!store || !chapter) return;
    setNote(null);
    stopPlayback();
    try {
      const r = await ensureMic();
      if (!sessionId.current) {
        const s = await post({ action: "start_session", noiseFloorDb: roomCheck?.kind === "silence" ? roomCheck.levels.noiseFloorDb : null });
        sessionId.current = s.id;
      }
      r.start();
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't start recording");
    }
  }

  async function stopRecording() {
    const r = recorder.current;
    if (!r || !store || !chapter) return;
    setRecording(false);
    const { samples, sampleRate } = r.stop();
    if (samples.length < sampleRate / 2) return setNote("That take was too short to keep.");
    const takeNo = Math.max(0, ...takes.filter((t) => t.chapterId === chapter.id).map((t) => t.takeNo)) + 1;
    const fileName = fromSentence > 0 ? `take-${String(takeNo).padStart(3, "0")}-from-${fromSentence + 1}.wav` : `take-${String(takeNo).padStart(3, "0")}.wav`;
    const levels = measure(samples, sampleRate);
    try {
      // Saved to this computer first; only the take's details go to the server
      await saveFile(store, folder, fileName, encodeWav(samples, sampleRate));
      const durationMs = Math.round((samples.length / sampleRate) * 1000);
      const saved = await post({
        action: "add_take",
        chapterId: chapter.id,
        sessionId: sessionId.current,
        takeNo,
        fileName,
        fromSentence,
        toSentence: range?.to ?? null,
        noteId: range?.noteId ?? null,
        durationMs,
        sampleRate,
        peakDb: levels.peakDb,
        rmsDb: levels.rmsDb,
      });
      if (sessionId.current) await post({ action: "end_session", id: sessionId.current });
      const warn = roomAdvice(levels, "voice").find((a) => !a.ok);
      let placed = "";
      if (range) {
        // Cut the pickup straight into the chapter at the pauses around its lines
        const fresh: Take = { ...chapterTakes[0], id: saved.id, takeNo, fileName, fromSentence, toSentence: range.to, parentId: null, inMs: null, outMs: null, noteId: range.noteId ?? null, chosen: true, durationMs, createdAt: new Date().toISOString() };
        const all = [...chapterTakes, fresh];
        const err = await placeTake(fresh, all, sentences, async (tid) => {
          const t = all.find((x) => x.id === tid);
          const f = t && (await readFile(store, folder, t.fileName));
          return f ? readPcm(f) : null;
        }, post).catch((e) => (e instanceof Error ? e.message : "Couldn't place the pickup"));
        placed = err ? ` ${err}` : " It's cut into the chapter; hear it in Review.";
        setRange(null);
      }
      setNote(warn ? `Take ${takeNo} saved. ${warn.message}${placed}` : `Take ${takeNo} saved to ${store.label}.${placed}`);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? `Couldn't save the take: ${e.message}` : "Couldn't save the take");
    }
  }

  async function play(t: Take) {
    if (playing?.id === t.id) return void player.current?.play();
    stopPlayback();
    if (!store) return;
    const file = await readFile(store, folder, t.fileName);
    if (!file) return setNote(`Couldn't find ${t.fileName} in ${store.label}. Was it moved or deleted?`);
    setPlayPos(0);
    setPlayLen(t.durationMs / 1000);
    setPaused(false);
    setPlaying({ id: t.id, url: URL.createObjectURL(file) });
  }

  function stopPlayback() {
    player.current?.pause();
    if (playing) URL.revokeObjectURL(playing.url);
    setPlaying(null);
    setPaused(false);
    setPlayPos(0);
  }

  async function removeTake(t: Take) {
    if (!window.confirm(`Delete take ${t.takeNo}? This removes the file from ${store?.label || "your computer"}.`)) return;
    if (playing?.id === t.id) stopPlayback();
    if (store) await deleteFile(store, folder, t.fileName);
    await post({ action: "delete_take", id: t.id }).catch(() => null);
    await load();
  }

  async function backup() {
    if (!store) return;
    setBackingUp(true);
    try {
      const files = await allFiles(store);
      if (!files.length) return setNote("Nothing to back up yet.");
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      // WAV barely compresses; storing keeps the zip quick to make
      for (const f of files) zip.file(f.path, f.file, { compression: "STORE" });
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `audiobook-recordings-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBackingUp(false);
    }
  }

  // Space starts and stops recording, outside text fields
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code !== "Space" || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName) || el.isContentEditable) return;
      if (!store || mode !== "record") return;
      e.preventDefault();
      void (recording ? stopRecording() : startRecording());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const meterPct = Math.max(0, Math.min(100, ((level + 60) / 60) * 100));
  const meterColor = level > -3 ? "bg-danger" : level > -12 ? "bg-warn" : "bg-accent";

  if (studio === null) return <p className="font-ui p-6 text-sm text-muted">Loading…</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="font-ui mx-auto max-w-5xl space-y-6">
          <div>
            <h2 className="font-display text-2xl">Audio</h2>
            <p className="mt-1 text-sm text-muted">
              Record your audiobook chapter by chapter, with the script in front of you. Recordings are saved on this computer, never uploaded. Every take
              you record here adds to the narration record behind the “Recorded in Novelist Writer” badge.
            </p>
          </div>

          {!studio ? (
            <div className="border border-accent p-4 text-sm">
              <p>The audiobook studio is part of Studio: record it yourself or invite a narrator, then export files ready for ACX, Spotify, Google Play, and Kobo.</p>
              <a href="/billing" className="mt-3 inline-block bg-accent px-4 py-2 text-xs text-paper">
                See Studio
              </a>
            </div>
          ) : hint ? (
            <p className="text-sm text-danger">{hint}</p>
          ) : (
            <>
              <p className="border border-line bg-paper-deep/40 px-3 py-2 text-xs text-muted md:hidden">
                Recording works best on a computer with Chrome or Edge and a USB or XLR microphone. You can look around here on a phone or tablet.
              </p>

              {summary && summary.takes > 0 && (
                <p className="text-sm">
                  Narration record: <strong>{hours(summary.recordedMs)}</strong> recorded here across {summary.sessions} session{summary.sessions === 1 ? "" : "s"}, {summary.takes} take
                  {summary.takes === 1 ? "" : "s"} ({summary.retakes} retake{summary.retakes === 1 ? "" : "s"} and pickups).
                </p>
              )}

              {role === "owner" && (
                <NarratorPanel
                  projectId={projectId}
                  bookTitle={bookTitle}
                  authorName={authorName}
                  words={ordered.reduce((n, c) => n + (c.content_text || "").split(/\s+/).filter(Boolean).length, 0)}
                  onChange={() => void load()}
                />
              )}
              {role === "narrator" && (
                <div className="border border-line bg-paper-deep/40 px-3 py-2 text-xs text-muted">
                  <p>
                    You&apos;re narrating this book for {authorName || "the author"}. Your recordings stay on your computer. Record each chapter, then open Review and send it: the author gets a small
                    review copy, pins notes to lines, and you record just those pickups.
                  </p>
                  {narrator?.checkpoint?.required && (
                    <p className="mt-1 text-ink">
                      Checkpoint:{" "}
                      {narrator.checkpoint.status === "approved"
                        ? "✓ approved. Record the rest of the book."
                        : narrator.checkpoint.status === "submitted"
                          ? "sent. Wait for the author's go-ahead before recording the rest."
                          : narrator.checkpoint.status === "changes"
                            ? `the author asked for changes${narrator.checkpoint.note ? `: “${narrator.checkpoint.note}”` : ""}. Fix them and send the chapter again.`
                            : "record about 15 minutes (usually the first chapter) and send it for review. The author approves it before full production."}
                    </p>
                  )}
                  {!storageReady && <p className="mt-1 text-danger">Sending review copies isn&apos;t available yet on this site.</p>}
                </div>
              )}

              {/* 1. Where recordings go */}
              <section className="border border-line p-4 text-sm">
                <h3 className="font-display text-lg">1. Where recordings are saved</h3>
                {store ? (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span>
                      ✓ Saving to <strong>{store.kind === "folder" ? `the folder “${store.label}”` : "this browser"}</strong>
                    </span>
                    <button type="button" disabled={backingUp} className="border border-line px-3 py-1.5 text-xs" onClick={() => void backup()}>
                      {backingUp ? "Making the zip…" : "Download a backup (zip)"}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted underline"
                      onClick={async () => {
                        await forgetFolder(projectId);
                        setStore(null);
                      }}
                    >
                      Change
                    </button>
                    {store.kind === "browser" && (
                      <p className="w-full text-xs text-danger">
                        Recordings in the browser are deleted if you clear this site&apos;s data, and they&apos;re only on this computer. Download a backup after every
                        session.
                      </p>
                    )}
                    {store.kind === "folder" && <p className="w-full text-xs text-muted">They&apos;re normal WAV files you can back up or open in any audio editor. Back them up like any important files.</p>}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {reconnect && (
                      <button
                        type="button"
                        className="bg-accent px-3 py-1.5 text-xs text-paper"
                        onClick={async () => {
                          const s = await restoreFolder(projectId, true);
                          if (s && !("needsClick" in s)) {
                            setStore(s);
                            setReconnect(null);
                          }
                        }}
                      >
                        Reconnect to “{reconnect}”
                      </button>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {supportsFolders() && (
                        <button
                          type="button"
                          className="bg-accent px-3 py-1.5 text-xs text-paper"
                          onClick={async () => {
                            try {
                              setStore(await chooseFolder(projectId));
                              setReconnect(null);
                            } catch (e) {
                              if (e instanceof Error && e.name !== "AbortError") setNote(e.message);
                            }
                          }}
                        >
                          Choose a folder on this computer (recommended)
                        </button>
                      )}
                      <button
                        type="button"
                        className="border border-line px-3 py-1.5 text-xs"
                        onClick={async () => setStore(await browserStore(projectId).catch((e) => (setNote(e.message), null)))}
                      >
                        Keep them in this browser
                      </button>
                    </div>
                    <p className="text-xs text-muted">
                      {supportsFolders()
                        ? "Pick or make an empty folder for this book, like “My Novel audiobook”. Each chapter gets its own folder of WAV files."
                        : "This browser can't save to a folder, so recordings stay inside the browser. Chrome or Edge on a computer can save them to a real folder."}
                    </p>
                  </div>
                )}
              </section>

              {/* 2. Microphone and room */}
              <section className="border border-line p-4 text-sm">
                <h3 className="font-display text-lg">2. Microphone and room</h3>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {mics.length > 1 && (
                    <select value={micId} onChange={(e) => void switchMic(e.target.value)} className="max-w-full border border-line bg-paper px-2 py-1.5 text-xs">
                      {mics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <button type="button" disabled={Boolean(checking) || recording} className="border border-line px-3 py-1.5 text-xs" onClick={() => void runCheck("silence")}>
                    {checking === "silence" ? "Stay quiet… 5 seconds" : "Check the room (5 seconds of silence)"}
                  </button>
                  <button type="button" disabled={Boolean(checking) || recording} className="border border-line px-3 py-1.5 text-xs" onClick={() => void runCheck("voice")}>
                    {checking === "voice" ? "Read a few lines… 5 seconds" : "Check your level (read for 5 seconds)"}
                  </button>
                  {micOn && (
                    <button type="button" disabled={Boolean(checking) || recording} className="border border-line px-3 py-1.5 text-xs disabled:opacity-50" onClick={() => void closeMic()}>
                      Turn the microphone off
                    </button>
                  )}
                </div>
                <div className="mt-3 h-2 w-full max-w-md overflow-hidden rounded-sm bg-line" aria-label="Input level">
                  <div className={`h-full transition-[width] duration-75 ${meterColor}`} style={{ width: `${micOn ? meterPct : 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {micOn ? "The microphone is on. Turn it off when you're done; it comes back on when you record." : "The microphone is off. It turns on when you run a check or record."}
                </p>
                {roomCheck &&
                  roomAdvice(roomCheck.levels, roomCheck.kind).map((a) => (
                    <p key={a.message} className={`mt-2 text-xs ${a.ok ? "text-accent" : "text-danger"}`}>
                      {a.ok ? "✓ " : ""}
                      {a.message}
                    </p>
                  ))}
                {roomCheck?.kind === "silence" && store && <p className="mt-1 text-xs text-muted">The silence was saved as this session&apos;s room tone, for gaps between takes.</p>}
              </section>

              {/* 3. Record */}
              <section className="border border-line p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-display text-lg">3. Record and review</h3>
                    <div className="flex border border-line text-xs" role="tablist">
                      {(["record", "review"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="tab"
                          aria-selected={mode === m}
                          disabled={recording || (m === "review" && chapter?.kind !== "chapter")}
                          title={m === "review" && chapter?.kind !== "chapter" ? "Credits are short: play the take in Record" : undefined}
                          onClick={() => {
                            stopPlayback();
                            setMode(m);
                          }}
                          className={`px-3 py-1.5 ${mode === m ? "bg-ink text-paper" : ""}`}
                        >
                          {m === "record" ? "Record" : `Review${chapterNotesOpen ? ` (${chapterNotesOpen})` : ""}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <select
                    value={chapterId}
                    disabled={recording}
                    onChange={(e) => {
                      stopPlayback();
                      setChapterId(e.target.value);
                      setRange(null);
                      if (!slots.find((s) => s.id === e.target.value && s.kind === "chapter")) setMode("record");
                    }}
                    className="max-w-full border border-line bg-paper px-2 py-1.5 text-xs"
                  >
                    {slots.map((c) => {
                      const n = takes.filter((t) => t.chapterId === c.id).length;
                      const st = reviews[c.id]?.status;
                      const num = c.kind === "chapter" ? `${ordered.findIndex((o) => o.id === c.id) + 1}. ` : "";
                      return (
                        <option key={c.id} value={c.id}>
                          {st === "approved" ? "✓ " : ""}
                          {num}
                          {c.title} {n ? `(${n} take${n === 1 ? "" : "s"}${st === "review" ? ", in review" : ""})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {!chapter ? (
                  <p className="mt-3 text-muted">Write a chapter first, then record it here.</p>
                ) : mode === "review" && chapter.kind === "chapter" ? (
                  // A narrator's review copy streams from storage, so listening to it doesn't need a recordings folder
                  store || chapterTakes.some((t) => t.recordedBy && t.recordedBy !== userId) ? (
                    <AudioReview
                      key={chapter.id}
                      store={store}
                      chapterId={chapter.id}
                      folder={folder}
                      sentences={sentences}
                      takes={chapterTakes}
                      notes={notes.filter((n) => n.chapterId === chapter.id)}
                      review={reviews[chapter.id]}
                      reviewHint={reviewHint}
                      post={post}
                      reload={load}
                      canManage={role === "owner"}
                      remote={reviewCopies[chapter.id] || null}
                      sendsCopies={role === "narrator" && storageReady}
                      listenBlocked={
                        chapterTakes.some((t) => t.chosen && !isPickup(t) && t.recordedBy && t.recordedBy !== userId)
                          ? "Your narrator recorded this chapter on their computer. You can listen once they send a review copy; you can already pin notes to the text."
                          : null
                      }
                      onRecordPickup={(n) => {
                        setRange({ from: n.sentence, to: n.toSentence, noteId: n.id });
                        setMode("record");
                        setNote(`Recording a pickup for: “${n.body}”`);
                      }}
                    />
                  ) : (
                    <p className="mt-3 text-muted">Choose where recordings are saved first, so the studio can open your takes.</p>
                  )
                ) : (
                  <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
                    <div className="min-w-0">
                      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-paper py-2">
                        {!recording ? (
                          <button type="button" disabled={!store} onClick={() => void startRecording()} className="flex items-center gap-2 bg-danger px-4 py-2 text-paper disabled:opacity-50">
                            <span className="h-2.5 w-2.5 rounded-full bg-paper" aria-hidden="true" /> Record {range ? `pickup: ${rangeLabel(range.from, range.to)}` : "chapter"}
                          </button>
                        ) : (
                          <button type="button" onClick={() => void stopRecording()} className="flex items-center gap-2 bg-ink px-4 py-2 text-paper">
                            <span className="h-2.5 w-2.5 bg-paper" aria-hidden="true" /> Stop · {mmss(elapsed)}
                          </button>
                        )}
                        {range && !recording && (
                          <>
                            <label className="flex items-center gap-1 text-xs text-muted">
                              through
                              <select
                                value={range.to == null ? "end" : String(range.to)}
                                onChange={(e) => setRange({ ...range, to: e.target.value === "end" ? null : Number(e.target.value) })}
                                className="border border-line bg-paper px-1 py-1 text-xs"
                              >
                                {Array.from({ length: Math.min(12, sentences.length - range.from) }, (_, k) => range.from + k).map((s) => (
                                  <option key={s} value={s}>
                                    sentence {s + 1}
                                  </option>
                                ))}
                                <option value="end">the end of the chapter</option>
                              </select>
                            </label>
                            <button type="button" className="text-xs text-muted underline" onClick={() => setRange(null)}>
                              Record the whole chapter instead
                            </button>
                          </>
                        )}
                        <span className="text-xs text-muted">
                          {store ? "Space starts and stops. Click a sentence to record a pickup from there; pickups are cut into the chapter automatically." : "Choose where recordings are saved first."}
                        </span>
                        {recording && elapsed > LONG_TAKE_MS && <span className="text-xs text-danger">Long take: stop soon and continue with a pickup, so nothing is lost if the browser crashes.</span>}
                      </div>
                      <div className="mt-2 max-h-[60vh] overflow-y-auto pr-1 font-display text-lg leading-relaxed">
                        {sentences.length === 0 ? (
                          <p className="font-ui text-sm text-muted">This chapter has no text yet.</p>
                        ) : (
                          sentences.map((s, i) => (
                            <span key={i}>
                              {s.paraStart && i > 0 && <span className="block h-4" />}
                              <button
                                type="button"
                                disabled={recording}
                                onClick={() => setRange({ from: i, to: null })}
                                className={`inline text-left ${
                                  range && i >= range.from && i <= (range.to ?? Infinity) ? "bg-accent/15" : range && i < range.from ? "text-muted" : ""
                                } ${range?.from === i ? "underline decoration-accent" : ""} hover:bg-accent/10`}
                              >
                                {s.text}
                              </button>{" "}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <aside className="min-w-0">
                      <p className="text-ink">Takes</p>
                      {chapterTakes.length === 0 ? (
                        <p className="mt-1 text-xs text-muted">None yet.</p>
                      ) : (
                        <ul className="mt-1 divide-y divide-line border-y border-line text-xs">
                          {chapterTakes.map((t) => (
                            <li key={t.id} className="py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span>
                                  {t.chosen && <span className="text-accent">✓ </span>}Take {t.takeNo}
                                  <span className="text-muted"> · {mmss(t.durationMs)}</span>
                                </span>
                                {t.recordedBy && userId && t.recordedBy !== userId ? (
                                  <span className="text-muted">{role === "owner" ? "Your narrator's take" : "The author's take"}</span>
                                ) : (
                                <span className="flex gap-2">
                                  {playing?.id === t.id && !paused ? (
                                    <button type="button" className="text-accent underline" onClick={() => player.current?.pause()}>
                                      Pause
                                    </button>
                                  ) : (
                                    <button type="button" className="text-accent underline" onClick={() => void play(t)}>
                                      {playing?.id === t.id ? "Resume" : "Play"}
                                    </button>
                                  )}
                                  {playing?.id === t.id && (
                                    <button type="button" className="underline" onClick={stopPlayback}>
                                      Stop
                                    </button>
                                  )}
                                  {!t.chosen && (
                                    <button type="button" className="underline" onClick={() => void post({ action: "choose_take", id: t.id }).then(load)}>
                                      Use
                                    </button>
                                  )}
                                  <button type="button" className="text-danger underline" onClick={() => void removeTake(t)}>
                                    Delete
                                  </button>
                                </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-muted">
                                {isPickup(t) ? `Pickup, ${rangeLabel(t.fromSentence, t.toSentence)}: “${(sentences[t.fromSentence]?.text || "").slice(0, 40)}…”` : "Whole chapter"}
                                {t.peakDb != null && t.peakDb > -3 ? " · too loud in places" : ""}
                              </p>
                              {playing?.id === t.id && (
                                <div className="mt-1 flex items-center gap-2">
                                  <audio
                                    ref={player}
                                    src={playing.url}
                                    autoPlay
                                    onPlay={() => setPaused(false)}
                                    onPause={() => setPaused(true)}
                                    onEnded={stopPlayback}
                                    onTimeUpdate={(e) => setPlayPos(e.currentTarget.currentTime)}
                                    onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setPlayLen(e.currentTarget.duration)}
                                  />
                                  <input
                                    type="range"
                                    min={0}
                                    max={playLen || 0}
                                    step={0.1}
                                    value={Math.min(playPos, playLen)}
                                    onChange={(e) => {
                                      if (player.current) player.current.currentTime = Number(e.target.value);
                                      setPlayPos(Number(e.target.value));
                                    }}
                                    aria-label={`Position in take ${t.takeNo}`}
                                    className="min-w-0 flex-1 accent-[var(--accent)]"
                                  />
                                  <span className="shrink-0 tabular-nums text-muted">
                                    {mmss(playPos * 1000)} / {mmss(playLen * 1000)}
                                  </span>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-2 text-[11px] text-muted">
                        The ✓ takes are used when the chapter is put together: the whole-chapter take, with each pickup cut in over its lines. Listen to the result in Review.
                      </p>
                    </aside>
                  </div>
                )}
              </section>

              {/* 4. Master and export */}
              <section className="border border-line p-4 text-sm">
                <h3 className="font-display text-lg">4. Master and export</h3>
                <AudioExport
                  store={store}
                  slots={slots}
                  takes={takes}
                  reviews={reviews}
                  settings={settings}
                  exportHint={exportHint}
                  coverUrl={coverPath ? coverPublicUrl(coverPath) : null}
                  userId={userId}
                  canEditSettings={role === "owner"}
                  deliver={role === "narrator" && storageReady ? post : null}
                  onSettings={(s) => {
                    setSettings(s);
                    void post({ action: "settings", settings: s }).catch((e) => setNote(e instanceof Error ? e.message : "Couldn't save"));
                  }}
                />
              </section>
            </>
          )}
          {note && <p className="text-sm text-ink">{note}</p>}
        </div>
      </div>
    </div>
  );
}

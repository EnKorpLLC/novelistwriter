"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chapter } from "@/lib/types";
import { encodeWav, measure, roomAdvice, type Levels } from "@/lib/audio/wav";
import { Recorder, listMicrophones, openMicrophone } from "@/lib/audio/recorder";
import { allFiles, browserStore, chapterFolder, chooseFolder, deleteFile, forgetFolder, readFile, restoreFolder, saveFile, supportsFolders, type AudioStore } from "@/lib/audio/local-store";

type Take = { id: string; chapterId: string; takeNo: number; fileName: string; fromSentence: number; durationMs: number; peakDb: number | null; rmsDb: number | null; chosen: boolean; imported: boolean; createdAt: string };
type RecordSummary = { sessions: number; recordedMs: number; takes: number; retakes: number; firstAt: string | null; lastAt: string | null };

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const hours = (ms: number) => (ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} hours` : `${Math.round(ms / 60000)} minutes`);
// A chapter held in memory grows about 6 MB a minute; past this, ask the narrator to split it
const LONG_TAKE_MS = 45 * 60_000;

/** Sentences to read from, split on sentence ends; blank lines start new paragraphs. */
function sentencesOf(text: string): { text: string; paraStart: boolean }[] {
  const out: { text: string; paraStart: boolean }[] = [];
  for (const para of text.split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
    const parts = para.split(/(?<=[.!?…]["”’)\]]?)\s+(?=["“‘(\[]?[A-Z0-9])/);
    parts.forEach((s, i) => out.push({ text: s, paraStart: i === 0 }));
  }
  return out;
}

/** Audio tab (Studio): record the audiobook chapter by chapter. Recordings stay on this computer. */
export function AudioStudio({ projectId, chapters }: { projectId: string; chapters: Chapter[] }) {
  const ordered = useMemo(() => [...chapters].sort((a, b) => a.sort_order - b.sort_order), [chapters]);
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
  const [fromSentence, setFromSentence] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [backingUp, setBackingUp] = useState(false);
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
    setMics(await listMicrophones().catch(() => []));
    return r;
  }

  async function switchMic(id: string) {
    setMicId(id);
    await recorder.current?.close();
    stream.current?.getTracks().forEach((t) => t.stop());
    recorder.current = null;
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

  const chapterIndex = ordered.findIndex((c) => c.id === chapterId);
  const chapter = ordered[chapterIndex];
  const sentences = useMemo(() => sentencesOf(chapter?.content_text || ""), [chapter?.content_text]);
  const chapterTakes = takes.filter((t) => t.chapterId === chapterId).sort((a, b) => b.takeNo - a.takeNo);

  async function startRecording() {
    if (!store || !chapter) return;
    setNote(null);
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
      await saveFile(store, chapterFolder(chapterIndex), fileName, encodeWav(samples, sampleRate));
      await post({
        action: "add_take",
        chapterId: chapter.id,
        sessionId: sessionId.current,
        takeNo,
        fileName,
        fromSentence,
        durationMs: Math.round((samples.length / sampleRate) * 1000),
        sampleRate,
        peakDb: levels.peakDb,
        rmsDb: levels.rmsDb,
      });
      if (sessionId.current) await post({ action: "end_session", id: sessionId.current });
      const warn = roomAdvice(levels, "voice").find((a) => !a.ok);
      setNote(warn ? `Take ${takeNo} saved. ${warn.message}` : `Take ${takeNo} saved to ${store.label}.`);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? `Couldn't save the take: ${e.message}` : "Couldn't save the take");
    }
  }

  async function play(t: Take) {
    if (playing) URL.revokeObjectURL(playing.url);
    if (!store) return;
    const file = await readFile(store, chapterFolder(chapterIndex), t.fileName);
    if (!file) return setNote(`Couldn't find ${t.fileName} in ${store.label}. Was it moved or deleted?`);
    setPlaying({ id: t.id, url: URL.createObjectURL(file) });
  }

  async function removeTake(t: Take) {
    if (!window.confirm(`Delete take ${t.takeNo}? This removes the file from ${store?.label || "your computer"}.`)) return;
    if (store) await deleteFile(store, chapterFolder(chapterIndex), t.fileName);
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
      if (!store) return;
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
              <p>The audiobook studio is part of Studio: record it yourself, or (soon) invite a narrator, then export files ready for ACX, Spotify, Google Play, and Kobo.</p>
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
                </div>
                <div className="mt-3 h-2 w-full max-w-md overflow-hidden rounded-sm bg-line" aria-label="Input level">
                  <div className={`h-full transition-[width] duration-75 ${meterColor}`} style={{ width: `${recorder.current ? meterPct : 0}%` }} />
                </div>
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
                  <h3 className="font-display text-lg">3. Record</h3>
                  <select
                    value={chapterId}
                    disabled={recording}
                    onChange={(e) => {
                      setChapterId(e.target.value);
                      setFromSentence(0);
                    }}
                    className="max-w-full border border-line bg-paper px-2 py-1.5 text-xs"
                  >
                    {ordered.map((c, i) => {
                      const n = takes.filter((t) => t.chapterId === c.id).length;
                      return (
                        <option key={c.id} value={c.id}>
                          {i + 1}. {c.title || "Untitled"} {n ? `(${n} take${n === 1 ? "" : "s"})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {!chapter ? (
                  <p className="mt-3 text-muted">Write a chapter first, then record it here.</p>
                ) : (
                  <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
                    <div className="min-w-0">
                      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-paper py-2">
                        {!recording ? (
                          <button type="button" disabled={!store} onClick={() => void startRecording()} className="flex items-center gap-2 bg-danger px-4 py-2 text-paper disabled:opacity-50">
                            <span className="h-2.5 w-2.5 rounded-full bg-paper" aria-hidden="true" /> Record {fromSentence > 0 ? `from sentence ${fromSentence + 1}` : "chapter"}
                          </button>
                        ) : (
                          <button type="button" onClick={() => void stopRecording()} className="flex items-center gap-2 bg-ink px-4 py-2 text-paper">
                            <span className="h-2.5 w-2.5 bg-paper" aria-hidden="true" /> Stop · {mmss(elapsed)}
                          </button>
                        )}
                        {fromSentence > 0 && !recording && (
                          <button type="button" className="text-xs text-muted underline" onClick={() => setFromSentence(0)}>
                            Start from the top instead
                          </button>
                        )}
                        <span className="text-xs text-muted">{store ? "Space starts and stops. Click a sentence to record a pickup from there." : "Choose where recordings are saved first."}</span>
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
                                onClick={() => setFromSentence(i)}
                                className={`inline text-left ${i === fromSentence && fromSentence > 0 ? "bg-accent/15 underline decoration-accent" : i < fromSentence ? "text-muted" : ""} hover:bg-accent/10`}
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
                                <span className="flex gap-2">
                                  <button type="button" className="text-accent underline" onClick={() => void play(t)}>
                                    Play
                                  </button>
                                  {!t.chosen && (
                                    <button type="button" className="underline" onClick={() => void post({ action: "choose_take", id: t.id }).then(load)}>
                                      Use
                                    </button>
                                  )}
                                  <button type="button" className="text-danger underline" onClick={() => void removeTake(t)}>
                                    Delete
                                  </button>
                                </span>
                              </div>
                              <p className="mt-0.5 text-muted">
                                {t.fromSentence > 0 ? `Pickup from “${(sentences[t.fromSentence]?.text || "").slice(0, 40)}…”` : "Whole chapter"}
                                {t.peakDb != null && t.peakDb > -3 ? " · too loud in places" : ""}
                              </p>
                              {playing?.id === t.id && <audio src={playing.url} controls autoPlay className="mt-1 w-full" />}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-2 text-[11px] text-muted">
                        The ✓ take is used when the chapter is put together. Pickups replace the chapter from their sentence on; review and splicing come in the next step.
                      </p>
                    </aside>
                  </div>
                )}
              </section>
            </>
          )}
          {note && <p className="text-sm text-ink">{note}</p>}
        </div>
      </div>
    </div>
  );
}

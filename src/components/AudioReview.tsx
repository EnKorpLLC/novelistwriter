"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  assemble,
  coveringTake,
  findPauses,
  findQuote,
  frameDb,
  joinPreview,
  nextPause,
  pcmWav,
  placePickup,
  readPcm,
  sentenceCuts,
  type Pcm,
  type PauseMap,
  type PlacedTake,
  type Sentence,
} from "@/lib/audio/assemble";
import { readFile, type AudioStore } from "@/lib/audio/local-store";

export type StudioTake = PlacedTake & { takeNo: number; fileName: string; chosen: boolean; durationMs: number; noteId: string | null };
export type AudioNote = {
  id: string;
  chapterId: string;
  sentence: number;
  toSentence: number;
  quote: string;
  body: string;
  atMs: number | null;
  status: "open" | "fixed" | "dismissed";
  pickupTakeId: string | null;
  createdAt: string;
};
export type ChapterReview = { status: "recording" | "review" | "approved"; rounds: number; approvedAt: string | null };
type Post = (body: Record<string, unknown>) => Promise<Record<string, unknown>>;

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const mmssTenths = (ms: number) => `${mmss(ms)}.${Math.floor((ms % 1000) / 100)}`;
export const rootTake = (takes: StudioTake[]) => takes.find((t) => t.chosen && t.fromSentence === 0 && t.toSentence == null) || null;
export const isPickup = (t: StudioTake) => t.fromSentence > 0 || t.toSentence != null;
export function rangeLabel(from: number, to: number | null) {
  if (to == null) return `sentence ${from + 1} to the end`;
  return to > from ? `sentences ${from + 1}–${to + 1}` : `sentence ${from + 1}`;
}

/** Loads takes from the narrator's folder, keeping the last few in memory while they review. */
function useTakeLoader(store: AudioStore, folder: string, takes: StudioTake[]) {
  const cache = useRef(new Map<string, Pcm>());
  return async (id: string) => {
    const hit = cache.current.get(id);
    if (hit) return hit;
    const t = takes.find((x) => x.id === id);
    if (!t) return null;
    const f = await readFile(store, folder, t.fileName);
    if (!f) return null;
    const pcm = await readPcm(f);
    if (cache.current.size > 6) cache.current.delete(cache.current.keys().next().value as string);
    cache.current.set(id, pcm);
    return pcm;
  };
}

/** Cut a new pickup into whichever take currently covers its first sentence, at the pauses around its lines. */
export async function placeTake(
  take: StudioTake,
  takes: StudioTake[],
  sentences: Sentence[],
  load: (id: string) => Promise<Pcm | null>,
  post: Post
): Promise<string | null> {
  const root = rootTake(takes);
  if (!root) return "Record the whole chapter first; pickups are cut into it.";
  const placed = takes.filter((t) => t.chosen && t.id !== take.id);
  const parentId = coveringTake(root.id, placed, take.fromSentence);
  const parent = takes.find((t) => t.id === parentId)!;
  const pcm = await load(parentId);
  if (!pcm) return `Couldn't open ${parent.fileName} to place the pickup.`;
  const end = parent.toSentence == null ? sentences.length : parent.toSentence + 1;
  const lengths = sentences.slice(parent.fromSentence, end).map((s) => s.text.length);
  const at = placePickup(findPauses(frameDb(pcm)), lengths, parent.fromSentence, take.fromSentence, take.toSentence);
  await post({ action: "place_take", id: take.id, parentId, inMs: at.inMs, outMs: at.outMs });
  return null;
}

export function AudioReview({
  store,
  chapterId,
  folder,
  sentences,
  takes,
  notes,
  review,
  reviewHint,
  post,
  reload,
  onRecordPickup,
  canManage = true,
  listenBlocked = null,
}: {
  /** The author approves chapters and writes notes; a narrator reads notes and records pickups */
  canManage?: boolean;
  /** Why this browser can't play the chapter (the takes are on someone else's computer) */
  listenBlocked?: string | null;
  store: AudioStore;
  chapterId: string;
  folder: string;
  sentences: Sentence[];
  takes: StudioTake[];
  notes: AudioNote[];
  review: ChapterReview | undefined;
  reviewHint: string | null;
  post: Post;
  reload: () => Promise<void>;
  onRecordPickup: (note: AudioNote) => void;
}) {
  const root = rootTake(takes);
  const chosen = useMemo(() => takes.filter((t) => t.chosen), [takes]);
  const load = useTakeLoader(store, folder, takes);
  const [built, setBuilt] = useState<{ url: string; cuts: number[]; ms: number } | null>(null);
  const [building, setBuilding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [paused, setPaused] = useState(true);
  const [draft, setDraft] = useState<{ from: number; to: number; body: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [maps, setMaps] = useState<Record<string, PauseMap>>({});
  const player = useRef<HTMLAudioElement | null>(null);
  const joinPlayer = useRef<HTMLAudioElement | null>(null);
  const lines = useRef<(HTMLButtonElement | null)[]>([]);

  // Anything that changes the chapter's audio means putting it together again
  const signature = JSON.stringify(chosen.map((t) => [t.id, t.parentId, t.inMs, t.outMs]));
  useEffect(() => {
    setBuilt((b) => {
      if (b) URL.revokeObjectURL(b.url);
      return null;
    });
  }, [signature]);
  useEffect(() => () => void (built && URL.revokeObjectURL(built.url)), [built]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function build() {
    if (!root) return;
    setBuilding(true);
    setMsg(null);
    try {
      const r = await assemble(root.id, chosen, load);
      if (!r) return setMsg(`Couldn't find ${root.fileName}. Was it moved or deleted?`);
      const cuts = sentenceCuts(findPauses(frameDb(r.pcm)), sentences.map((s) => s.text.length));
      setBuilt({ url: URL.createObjectURL(pcmWav(r.pcm)), cuts, ms: (r.pcm.data.length / r.pcm.rate) * 1000 });
      if (r.missing.length) setMsg(`${r.missing.length} pickup file${r.missing.length === 1 ? " is" : "s are"} missing, so ${r.missing.length === 1 ? "it was" : "they were"} left out.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't put the chapter together");
    } finally {
      setBuilding(false);
    }
  }

  const current = built ? Math.max(0, built.cuts.findIndex((c, i) => pos * 1000 >= c && pos * 1000 < (built.cuts[i + 1] ?? Infinity))) : -1;
  useEffect(() => {
    if (!paused && current >= 0) lines.current[current]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current, paused]);

  const located = notes.map((n) => ({ ...n, at: findQuote(sentences, n.quote, n.sentence) }));
  const open = located.filter((n) => n.status === "open").sort((a, b) => a.at - b.at);
  const done = located.filter((n) => n.status !== "open");
  const noted = new Set(open.flatMap((n) => Array.from({ length: n.toSentence - n.sentence + 1 }, (_, i) => n.at + i)));
  const pickups = chosen.filter(isPickup).sort((a, b) => a.fromSentence - b.fromSentence);
  const status = review?.status || "recording";

  function clickSentence(i: number) {
    if (built && player.current) player.current.currentTime = built.cuts[i] / 1000;
    if (!canManage) return;
    // A later sentence stretches a note that hasn't been written yet; anything else starts a new one
    setDraft((d) => (d && i > d.from && !d.body.trim() ? { ...d, to: i } : { from: i, to: i, body: "" }));
  }

  async function saveNote() {
    if (!draft?.body.trim()) return;
    try {
      await post({
        action: "add_note",
        chapterId,
        sentence: draft.from,
        toSentence: draft.to,
        quote: sentences[draft.from]?.text || "",
        body: draft.body,
        atMs: built ? Math.round(pos * 1000) : null,
      });
    } catch (e) {
      return setMsg(e instanceof Error ? e.message : "Couldn't save the note");
    }
    setDraft(null);
    await reload();
  }

  async function setStatus(next: ChapterReview["status"]) {
    if (next === "approved" && open.length && !window.confirm(`${open.length} note${open.length === 1 ? " is" : "s are"} still open. Approve the chapter anyway?`)) return;
    await post({ action: "chapter_status", chapterId, status: next }).catch((e) => setMsg(e instanceof Error ? e.message : "Couldn't update the chapter"));
    await reload();
  }

  async function mapFor(id: string) {
    if (maps[id]) return maps[id];
    const pcm = await load(id);
    if (!pcm) return null;
    const m = findPauses(frameDb(pcm));
    setMaps((x) => ({ ...x, [id]: m }));
    return m;
  }

  async function hearJoin(t: StudioTake) {
    if (!t.parentId || t.inMs == null) return;
    const [parent, child] = await Promise.all([load(t.parentId), load(t.id)]);
    if (!parent || !child) return setMsg("Couldn't open the takes for this join.");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(pcmWav(joinPreview(parent, child, t.inMs, t.outMs))));
    setTimeout(() => void joinPlayer.current?.play(), 50);
  }

  async function nudge(t: StudioTake, edge: "in" | "out", dir: -1 | 1) {
    if (!t.parentId) return;
    const m = await mapFor(t.parentId);
    if (!m) return;
    const from = edge === "in" ? t.inMs! : (t.outMs ?? m.totalMs);
    const to = nextPause(m, from, dir);
    if (to == null) return setMsg("There's no pause further that way.");
    const inMs = edge === "in" ? Math.round(to) : t.inMs!;
    const outMs = edge === "out" ? (to >= m.speechEndMs ? null : Math.round(to)) : t.outMs;
    if (outMs != null && outMs <= inMs) return setMsg("The end has to come after the start.");
    await post({ action: "place_take", id: t.id, parentId: t.parentId, inMs, outMs });
    await reload();
  }

  async function place(t: StudioTake) {
    const err = await placeTake(t, takes, sentences, load, post);
    if (err) setMsg(err);
    await reload();
  }

  if (reviewHint) return <p className="mt-3 text-sm text-danger">{reviewHint}</p>;
  if (!root) return <p className="mt-3 text-muted">Record the whole chapter first, then review it here.</p>;

  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0">
        {/* Chapter status */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2 text-xs">
          <span className={status === "approved" ? "text-accent" : "text-muted"}>
            {status === "approved" ? "✓ Approved" : status === "review" ? "In review" : "Recording"}
            {review?.rounds ? ` · round ${review.rounds + 1}` : ""}
          </span>
          {status === "recording" && (
            <button type="button" className="border border-line px-2 py-1" onClick={() => void setStatus("review")}>
              {canManage ? "Ready for review" : "Send for review"}
            </button>
          )}
          {canManage && status !== "approved" && (
            <button type="button" className="bg-accent px-2 py-1 text-paper" onClick={() => void setStatus("approved")}>
              Approve chapter
            </button>
          )}
          {canManage && status === "review" && open.length > 0 && (
            <button type="button" className="border border-line px-2 py-1" onClick={() => void setStatus("recording")}>
              Send back for {open.length} pickup{open.length === 1 ? "" : "s"}
            </button>
          )}
          {canManage && status === "approved" && (
            <button type="button" className="underline" onClick={() => void setStatus("review")}>
              Reopen
            </button>
          )}
          {!canManage && status === "review" && <span className="text-muted">Waiting for the author&apos;s review</span>}
        </div>

        {/* Player */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-paper py-2 text-xs">
          {listenBlocked ? (
            <p className="text-muted">{listenBlocked}</p>
          ) : !built ? (
            <button type="button" disabled={building} className="bg-ink px-4 py-2 text-paper disabled:opacity-60" onClick={() => void build()}>
              {building ? "Putting the chapter together…" : "Listen to the chapter"}
            </button>
          ) : (
            <>
              <audio
                ref={player}
                src={built.url}
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
                onEnded={() => setPaused(true)}
                onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
              />
              <button type="button" className="bg-ink px-3 py-1.5 text-paper" onClick={() => void (paused ? player.current?.play() : player.current?.pause())}>
                {paused ? "Play" : "Pause"}
              </button>
              <button
                type="button"
                className="border border-line px-3 py-1.5"
                onClick={() => {
                  if (!player.current) return;
                  player.current.pause();
                  player.current.currentTime = 0;
                  setPos(0);
                }}
              >
                Stop
              </button>
              <button type="button" className="border border-line px-2 py-1.5" onClick={() => player.current && (player.current.currentTime = Math.max(0, pos - 5))} aria-label="Back 5 seconds">
                −5s
              </button>
              <input
                type="range"
                min={0}
                max={built.ms / 1000}
                step={0.1}
                value={pos}
                onChange={(e) => player.current && (player.current.currentTime = Number(e.target.value))}
                aria-label="Position in the chapter"
                className="min-w-[8rem] flex-1 accent-[var(--accent)]"
              />
              <span className="tabular-nums text-muted">
                {mmss(pos * 1000)} / {mmss(built.ms)}
              </span>
              <a href={built.url} download={`${folder}.wav`} className="underline">
                Download (WAV)
              </a>
            </>
          )}
          <span className="w-full text-muted">
            {canManage ? "Click a sentence to jump there and pin a note to it. Click a later sentence to stretch the note over several." : "Click a sentence to jump there. Notes from the author are underlined in red."}
          </span>
        </div>

        {draft && (
          <div className="mt-2 border border-accent p-3 text-xs">
            <p className="text-muted">
              Note on {rangeLabel(draft.from, draft.to)}: “{(sentences[draft.from]?.text || "").slice(0, 80)}
              {(sentences[draft.from]?.text || "").length > 80 ? "…" : ""}”
            </p>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="What to fix, like “Aelith is AY-lith” or “softer here”"
              rows={2}
              className="mt-2 w-full border border-line bg-paper p-2 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={!draft.body.trim()} className="bg-accent px-3 py-1.5 text-paper disabled:opacity-50" onClick={() => void saveNote()}>
                Save note
              </button>
              <button type="button" className="underline" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-2 max-h-[60vh] overflow-y-auto pr-1 font-display text-lg leading-relaxed">
          {sentences.map((s, i) => (
            <span key={i}>
              {s.paraStart && i > 0 && <span className="block h-4" />}
              <button
                ref={(el) => {
                  lines.current[i] = el;
                }}
                type="button"
                onClick={() => clickSentence(i)}
                className={`inline text-left hover:bg-accent/10 ${i === current ? "bg-accent/20" : ""} ${noted.has(i) ? "underline decoration-danger decoration-2" : ""} ${
                  draft && i >= draft.from && i <= draft.to ? "bg-accent/15" : ""
                }`}
              >
                {s.text}
              </button>{" "}
            </span>
          ))}
        </div>
        {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
      </div>

      <aside className="min-w-0 space-y-4 text-xs">
        <div>
          <p className="text-sm text-ink">Notes to fix {open.length > 0 && <span className="text-muted">({open.length})</span>}</p>
          {open.length === 0 ? (
            <p className="mt-1 text-muted">{notes.length ? "All fixed." : canManage ? "None yet. Listen through and click any sentence that needs another go." : "None yet. The author's notes show up here."}</p>
          ) : (
            <ul className="mt-1 divide-y divide-line border-y border-line">
              {open.map((n) => (
                <li key={n.id} className="py-2">
                  <button type="button" className="text-left text-muted hover:underline" onClick={() => clickSentence(n.at)}>
                    {rangeLabel(n.at, n.at + (n.toSentence - n.sentence))}: “{n.quote.slice(0, 50)}
                    {n.quote.length > 50 ? "…" : ""}”
                  </button>
                  <p className="mt-0.5 text-ink">{n.body}</p>
                  <span className="mt-1 flex flex-wrap gap-2">
                    <button type="button" className="text-accent underline" onClick={() => onRecordPickup({ ...n, sentence: n.at, toSentence: n.at + (n.toSentence - n.sentence) })}>
                      Record pickup
                    </button>
                    {canManage && (
                      <>
                        <button type="button" className="underline" onClick={() => void post({ action: "update_note", id: n.id, status: "dismissed" }).then(reload)}>
                          Fine as is
                        </button>
                        <button type="button" className="text-danger underline" onClick={() => void post({ action: "delete_note", id: n.id }).then(reload)}>
                          Delete
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {done.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-muted">Fixed or left as is ({done.length})</summary>
              <ul className="mt-1 space-y-1">
                {done.map((n) => (
                  <li key={n.id}>
                    <span className="text-muted">{n.status === "fixed" ? "✓ Fixed: " : "Left as is: "}</span>
                    {n.body}{" "}
                    {canManage && (
                      <button type="button" className="underline" onClick={() => void post({ action: "update_note", id: n.id, status: "open" }).then(reload)}>
                        Reopen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div>
          <p className="text-sm text-ink">Pickups in this chapter</p>
          {pickups.length === 0 ? (
            <p className="mt-1 text-muted">None yet.</p>
          ) : (
            <ul className="mt-1 divide-y divide-line border-y border-line">
              {pickups.map((t) => (
                <li key={t.id} className="py-2">
                  <p>
                    Take {t.takeNo}: {rangeLabel(t.fromSentence, t.toSentence)}
                  </p>
                  {t.inMs == null || !t.parentId ? (
                    <button type="button" className="mt-1 text-accent underline" onClick={() => void place(t)}>
                      Cut it into the chapter
                    </button>
                  ) : (
                    <>
                      <p className="mt-0.5 text-muted">
                        Replaces {mmssTenths(t.inMs)} to {t.outMs == null ? "the end" : mmssTenths(t.outMs)} of take {takes.find((x) => x.id === t.parentId)?.takeNo ?? "?"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <button type="button" className="text-accent underline" onClick={() => void hearJoin(t)}>
                          Hear the join
                        </button>
                        <span className="text-muted">Start:</span>
                        <button type="button" className="border border-line px-1.5" onClick={() => void nudge(t, "in", -1)} aria-label="Start at the pause before">
                          ◀
                        </button>
                        <button type="button" className="border border-line px-1.5" onClick={() => void nudge(t, "in", 1)} aria-label="Start at the pause after">
                          ▶
                        </button>
                        <span className="text-muted">End:</span>
                        <button type="button" className="border border-line px-1.5" onClick={() => void nudge(t, "out", -1)} aria-label="End at the pause before">
                          ◀
                        </button>
                        <button type="button" className="border border-line px-1.5" onClick={() => void nudge(t, "out", 1)} aria-label="End at the pause after">
                          ▶
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {preview && <audio ref={joinPlayer} src={preview} controls className="mt-2 w-full" />}
          <p className="mt-2 text-[11px] text-muted">
            Pickups are cut in at the pauses around their lines. If a join sounds wrong, move its start or end to the next pause and listen again.
          </p>
        </div>
      </aside>
    </div>
  );
}

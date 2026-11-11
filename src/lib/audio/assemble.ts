/**
 * The script's sentences, splicing pickups into takes, and finding where each sentence falls in a take.
 * Client-safe, no dependencies. Works on the 16-bit samples as saved, so a long chapter isn't doubled in memory.
 */

export type Sentence = { text: string; paraStart: boolean };

/** Sentences to read from, split on sentence ends; blank lines start new paragraphs. */
export function sentencesOf(text: string): Sentence[] {
  const out: Sentence[] = [];
  for (const para of text.split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
    const parts = para.split(/(?<=[.!?…]["”’)\]]?)\s+(?=["“‘(\[]?[A-Z0-9])/);
    parts.forEach((s, i) => out.push({ text: s, paraStart: i === 0 }));
  }
  return out;
}

/** A note's sentence after edits to the text: where its quote now is, nearest the original spot. */
export function findQuote(sentences: Sentence[], quote: string, at: number): number {
  if (!quote || sentences[at]?.text === quote) return Math.min(at, Math.max(0, sentences.length - 1));
  let best = -1;
  sentences.forEach((s, i) => {
    if (s.text === quote && (best < 0 || Math.abs(i - at) < Math.abs(best - at))) best = i;
  });
  return best >= 0 ? best : Math.min(at, Math.max(0, sentences.length - 1));
}

export type Pcm = { data: Int16Array; rate: number };

/** A take as the splicer sees it. Pickups hang off a parent take, cut in between inMs and outMs (null = to the end). */
export type PlacedTake = {
  id: string;
  parentId: string | null;
  inMs: number | null;
  outMs: number | null;
  fromSentence: number;
  toSentence: number | null;
  createdAt: string;
};

const FRAME_MS = 20;
const PAD_MS = 150;
const FADE_MS = 5;

export async function readPcm(file: Blob): Promise<Pcm> {
  const buf = await file.arrayBuffer();
  const rate = new DataView(buf).getUint32(24, true);
  return { data: new Int16Array(buf, 44, Math.floor((buf.byteLength - 44) / 2)), rate };
}

export function pcmWav(pcm: Pcm): Blob {
  const h = new DataView(new ArrayBuffer(44));
  const text = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  h.setUint32(4, 36 + pcm.data.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  h.setUint32(16, 16, true);
  h.setUint16(20, 1, true);
  h.setUint16(22, 1, true);
  h.setUint32(24, pcm.rate, true);
  h.setUint32(28, pcm.rate * 2, true);
  h.setUint16(32, 2, true);
  h.setUint16(34, 16, true);
  text(36, "data");
  h.setUint32(40, pcm.data.length * 2, true);
  return new Blob([h.buffer, pcm.data.slice().buffer], { type: "audio/wav" });
}

export const durationMs = (pcm: Pcm) => (pcm.data.length / pcm.rate) * 1000;

/** Loudness of each 20 ms frame, in dB. */
export function frameDb(pcm: Pcm): Float32Array {
  const step = Math.max(1, Math.round((pcm.rate * FRAME_MS) / 1000));
  const n = Math.floor(pcm.data.length / step);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = f * step; i < (f + 1) * step; i++) {
      const x = pcm.data[i] / 32768;
      s += x * x;
    }
    out[f] = s > 0 ? 10 * Math.log10(s / step) : -120;
  }
  return out;
}

export type Pause = { startMs: number; endMs: number };
export type PauseMap = { pauses: Pause[]; speechStartMs: number; speechEndMs: number; totalMs: number };

/** The level between room noise and speech, from 20 ms frame levels; null when it's all one or the other. */
export function speechThreshold(db: Float32Array): number | null {
  if (db.length < 3) return null;
  const sorted = Float32Array.from(db).sort();
  const lo = sorted[Math.floor(sorted.length * 0.1)];
  const hi = sorted[Math.floor(sorted.length * 0.9)];
  return hi - lo < 6 ? null : lo + Math.max(6, (hi - lo) * 0.3);
}

/** Pauses between phrases: stretches well below speaking level, at least minMs long, inside the speech. */
export function findPauses(db: Float32Array, minMs = 160): PauseMap {
  const totalMs = db.length * FRAME_MS;
  const thr = speechThreshold(db);
  if (thr == null) return { pauses: [], speechStartMs: 0, speechEndMs: totalMs, totalMs };
  let first = 0;
  while (first < db.length && db[first] <= thr) first++;
  let last = db.length - 1;
  while (last > first && db[last] <= thr) last--;
  const pauses: Pause[] = [];
  let run = -1;
  for (let f = first; f <= last; f++) {
    if (db[f] <= thr) {
      if (run < 0) run = f;
    } else if (run >= 0) {
      if ((f - run) * FRAME_MS >= minMs) pauses.push({ startMs: run * FRAME_MS, endMs: f * FRAME_MS });
      run = -1;
    }
  }
  return { pauses, speechStartMs: first * FRAME_MS, speechEndMs: (last + 1) * FRAME_MS, totalMs };
}

const mid = (p: Pause) => (p.startMs + p.endMs) / 2;

/**
 * Where each sentence falls in a take, from the sentence lengths and the take's pauses.
 * Returns n + 1 cut points: sentence i runs from cuts[i] to cuts[i + 1]. Inner cuts sit in the middle of pauses,
 * matched in order, preferring longer pauses near where the text says the sentence should end.
 */
export function sentenceCuts(map: PauseMap, lengths: number[]): number[] {
  const n = lengths.length;
  const { pauses, speechStartMs: s0, speechEndMs: s1, totalMs } = map;
  if (n <= 1) return [0, totalMs];
  const total = lengths.reduce((a, b) => a + Math.max(1, b), 0);
  const est: number[] = [];
  let cum = 0;
  for (let i = 0; i < n - 1; i++) {
    cum += Math.max(1, lengths[i]);
    est.push(s0 + ((s1 - s0) * cum) / total);
  }
  const k = est.length;
  const m = pauses.length;
  if (m >= k) return matchPauses(pauses, lengths, s0, s1, totalMs, total);
  // Fewer pauses than sentences: snap what we can, keep the estimate for the rest
  let floor = 0;
  return [
    0,
    ...est.map((e) => {
      const near = pauses.filter((p) => mid(p) > floor && Math.abs(mid(p) - e) < 1500).sort((a, b) => Math.abs(mid(a) - e) - Math.abs(mid(b) - e))[0];
      floor = Math.max(floor + 1, near ? mid(near) : e);
      return floor;
    }),
    totalMs,
  ];
}

/**
 * Each inner cut takes a distinct pause, in order. Each sentence's time is judged against its length in text
 * (a ratio, so reading speed can drift over a chapter without the error adding up), and longer pauses score
 * better, since sentence ends are where narrators pause longest.
 */
function matchPauses(pauses: Pause[], lengths: number[], s0: number, s1: number, totalMs: number, totalChars: number): number[] {
  const n = lengths.length;
  const k = n - 1;
  const m = pauses.length;
  const msPerChar = (s1 - s0) / totalChars;
  const want = lengths.map((l) => Math.max(1, l) * msPerChar);
  const at = pauses.map(mid);
  const bonus = pauses.map((p) => (2 * (p.endMs - p.startMs)) / 1000);
  const seg = (i: number, from: number, to: number) => Math.abs(Math.log(Math.max(1, to - from) / want[i]));
  let prev = new Float64Array(m).fill(Infinity);
  const back = new Int32Array(k * m).fill(-1);
  for (let g = 0; g <= m - k; g++) prev[g] = seg(0, s0, at[g]) - bonus[g];
  for (let i = 1; i < k; i++) {
    const cur = new Float64Array(m).fill(Infinity);
    const reach = want[i] * 5 + 2000;
    for (let g = i; g <= m - k + i; g++) {
      let best = Infinity;
      let bestAt = -1;
      for (let h = g - 1; h >= i - 1; h--) {
        if (at[g] - at[h] > reach && bestAt >= 0) break;
        if (prev[h] === Infinity) continue;
        const c = prev[h] + seg(i, at[h], at[g]);
        if (c < best) {
          best = c;
          bestAt = h;
        }
      }
      if (bestAt >= 0) {
        cur[g] = best - bonus[g];
        back[i * m + g] = bestAt;
      }
    }
    prev = cur;
  }
  let g = -1;
  let best = Infinity;
  for (let j = k - 1; j < m; j++) {
    const c = prev[j] + seg(n - 1, at[j], s1);
    if (c < best) {
      best = c;
      g = j;
    }
  }
  const picked: number[] = new Array(k);
  for (let i = k - 1; i >= 0; i--) {
    picked[i] = g;
    g = back[i * m + g];
  }
  return [0, ...picked.map((p) => at[p]), totalMs];
}

/** The pause just before or after a time, for nudging a splice point. */
export function nextPause(map: PauseMap, ms: number, dir: -1 | 1): number | null {
  const mids = map.pauses.map(mid);
  const hit = dir < 0 ? mids.filter((x) => x < ms - 30).pop() : mids.find((x) => x > ms + 30);
  return hit ?? null;
}

/** Where a pickup of sentences from..to (to = null for "to the end") cuts into its parent take. */
export function placePickup(parentMap: PauseMap, parentLengths: number[], parentFrom: number, from: number, to: number | null): { inMs: number; outMs: number | null } {
  const cuts = sentenceCuts(parentMap, parentLengths);
  const a = Math.max(0, Math.min(parentLengths.length, from - parentFrom));
  const b = to == null ? parentLengths.length : to + 1 - parentFrom;
  return { inMs: Math.round(cuts[a]), outMs: b >= parentLengths.length ? null : Math.round(cuts[Math.max(a + 1, b)]) };
}

/** The take a new pickup starting at this sentence should cut into: the deepest placed pickup already covering it. */
export function coveringTake(rootId: string, takes: PlacedTake[], sentence: number): string {
  let current = rootId;
  for (;;) {
    const child = takes
      .filter((t) => t.parentId === current && t.inMs != null && t.fromSentence <= sentence && (t.toSentence == null || t.toSentence >= sentence))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!child) return current;
    current = child.id;
  }
}

function resample(pcm: Pcm, rate: number): Pcm {
  if (pcm.rate === rate) return pcm;
  const ratio = pcm.rate / rate;
  const out = new Int16Array(Math.floor(pcm.data.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = Math.round(pcm.data[j] * (1 - f) + (pcm.data[Math.min(j + 1, pcm.data.length - 1)] || 0) * f);
  }
  return { data: out, rate };
}

type Piece = { data: Int16Array; start: number; end: number };

function speechRange(pcm: Pcm): [number, number] {
  const span = findPauses(frameDb(pcm));
  const pad = (PAD_MS / 1000) * pcm.rate;
  return [Math.max(0, Math.floor((span.speechStartMs / 1000) * pcm.rate - pad)), Math.min(pcm.data.length, Math.ceil((span.speechEndMs / 1000) * pcm.rate + pad))];
}

function join(parts: Piece[], rate: number): Pcm {
  const out = new Int16Array(parts.reduce((n, p) => n + p.end - p.start, 0));
  const fade = Math.round((FADE_MS / 1000) * rate);
  let o = 0;
  parts.forEach((p, i) => {
    out.set(p.data.subarray(p.start, p.end), o);
    if (i > 0) {
      for (let j = 0; j < fade && o - 1 - j >= 0; j++) out[o - 1 - j] = Math.round(out[o - 1 - j] * (j / fade));
      for (let j = 0; j < fade && o + j < out.length; j++) out[o + j] = Math.round(out[o + j] * (j / fade));
    }
    o += p.end - p.start;
  });
  return { data: out, rate };
}

/** A few seconds either side of one splice, to hear whether the join sounds natural. */
export function joinPreview(parent: Pcm, child: Pcm, inMs: number, outMs: number | null, contextMs = 3000): Pcm {
  const rate = parent.rate;
  const c = resample(child, rate);
  const s = (ms: number) => Math.round((ms / 1000) * rate);
  const [a, b] = speechRange(c);
  const parts: Piece[] = [{ data: parent.data, start: Math.max(0, s(inMs - contextMs)), end: s(inMs) }, { data: c.data, start: a, end: b }];
  if (outMs != null) parts.push({ data: parent.data, start: s(outMs), end: Math.min(parent.data.length, s(outMs + contextMs)) });
  return join(parts.filter((p) => p.end > p.start), rate);
}

/**
 * The chapter as heard: the main take with every placed pickup cut in, pickups inside pickups included.
 * Where two pickups overlap on the same take, the newer one wins. Pickups are trimmed to their speech with a
 * little of their own room sound either side, and every join gets a 5 ms fade so there are no clicks.
 */
export async function assemble(rootId: string, takes: PlacedTake[], load: (id: string) => Promise<Pcm | null>): Promise<{ pcm: Pcm; missing: string[] } | null> {
  const cache = new Map<string, Pcm | null>();
  const missing: string[] = [];
  let rate = 0;
  async function get(id: string) {
    if (!cache.has(id)) {
      const p = await load(id);
      if (!p) missing.push(id);
      cache.set(id, p && rate ? resample(p, rate) : p);
    }
    return cache.get(id) || null;
  }
  const root = await get(rootId);
  if (!root) return null;
  rate = root.rate;

  async function pieces(id: string, pcm: Pcm, from: number, to: number, depth: number): Promise<Piece[]> {
    const placed: PlacedTake[] = [];
    for (const c of takes.filter((t) => t.parentId === id && t.inMs != null).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const end = (t: PlacedTake) => t.outMs ?? Infinity;
      for (let i = placed.length - 1; i >= 0; i--) if (placed[i].inMs! < end(c) && c.inMs! < end(placed[i])) placed.splice(i, 1);
      placed.push(c);
    }
    placed.sort((a, b) => a.inMs! - b.inMs!);
    const out: Piece[] = [];
    let cursor = from;
    for (const c of placed) {
      const inS = Math.round((c.inMs! / 1000) * rate);
      if (inS < cursor || inS >= to || depth > 20) continue;
      const child = await get(c.id);
      if (!child) continue;
      out.push({ data: pcm.data, start: cursor, end: inS });
      const [a, b] = speechRange(child);
      out.push(...(await pieces(c.id, child, a, b, depth + 1)));
      cursor = c.outMs == null ? to : Math.max(inS, Math.min(to, Math.round((c.outMs / 1000) * rate)));
    }
    out.push({ data: pcm.data, start: cursor, end: to });
    return out.filter((p) => p.end > p.start);
  }

  return { pcm: join(await pieces(rootId, root, 0, root.data.length, 0), rate), missing };
}

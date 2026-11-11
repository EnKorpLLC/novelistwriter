/**
 * Mastering to retail audiobook specs, the store checks, and MP3 encoding. Runs in the narrator's browser,
 * so heavy audio never touches our servers. Targets ACX's rules, the strictest of the common stores:
 * RMS -23 to -18 dB, peaks at or under -3 dB, noise floor at or under -60 dB, 0.5–1 s of room tone at the
 * start and 1–5 s at the end, under 120 minutes, 44.1 kHz, 192 kbps constant bit rate MP3.
 */
import { findPauses, speechThreshold, type Pcm } from "@/lib/audio/assemble";

export const OUT_RATE = 44100;
export const KBPS = 192;
const TARGET_RMS = -20;
const CEILING_DB = -3.5;
const FLOOR_TARGET = -63;
const HEAD_S = 0.75;
const TAIL_S = 2.5;
const FRAME_S = 0.02;

const toDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);
const lin = (d: number) => Math.pow(10, d / 20);

export function toFloat(pcm: Pcm): Float32Array {
  const out = new Float32Array(pcm.data.length);
  for (let i = 0; i < out.length; i++) out[i] = pcm.data[i] / 32768;
  return out;
}

/** 44.1 kHz for every store. Browsers resample cleanly; without one (tests), linear. */
export async function to44k(x: Float32Array, rate: number): Promise<Float32Array> {
  if (rate === OUT_RATE) return x;
  const len = Math.ceil((x.length * OUT_RATE) / rate);
  if (typeof OfflineAudioContext !== "undefined") {
    const ctx = new OfflineAudioContext(1, len, OUT_RATE);
    const buf = ctx.createBuffer(1, x.length, rate);
    buf.copyToChannel(x as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    return (await ctx.startRendering()).getChannelData(0);
  }
  const out = new Float32Array(len);
  const ratio = rate / OUT_RATE;
  for (let i = 0; i < len; i++) {
    const p = i * ratio;
    const j = Math.floor(p);
    out[i] = x[j] * (1 - (p - j)) + (x[Math.min(j + 1, x.length - 1)] || 0) * (p - j);
  }
  return out;
}

/** Removes rumble below the voice (traffic, desk bumps, air handling), in place. */
function highPass(x: Float32Array, rate: number, hz = 80) {
  const w = (2 * Math.PI * hz) / rate;
  const q = Math.SQRT1_2;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = b0 * x0 + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
}

function frames(x: Float32Array, rate: number): Float32Array {
  const step = Math.max(1, Math.round(rate * FRAME_S));
  const n = Math.floor(x.length / step);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = f * step; i < (f + 1) * step; i++) s += x[i] * x[i];
    out[f] = s > 0 ? 10 * Math.log10(s / step) : -120;
  }
  return out;
}

export type Levels = { rmsDb: number; peakDb: number; floorDb: number; headS: number; tailS: number; minutes: number };

/** The numbers the stores judge: whole-file RMS, peak, the quietest half second, and the room tone at each end. */
export function levels(x: Float32Array, rate: number): Levels {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    sum += x[i] * x[i];
  }
  const win = Math.floor(rate / 2);
  let quietest = Infinity;
  for (let s = 0; s + win <= x.length; s += Math.floor(win / 2)) {
    let w = 0;
    for (let i = s; i < s + win; i++) w += x[i] * x[i];
    quietest = Math.min(quietest, Math.sqrt(w / win));
  }
  const map = findPauses(frames(x, rate));
  const total = x.length / rate;
  return {
    rmsDb: toDb(Math.sqrt(sum / Math.max(1, x.length))),
    peakDb: toDb(peak),
    floorDb: toDb(quietest === Infinity ? 0 : quietest),
    headS: map.speechStartMs / 1000,
    tailS: Math.max(0, total - map.speechEndMs / 1000),
    minutes: total / 60,
  };
}

/** The file's own quietest stretch, looped with short crossfades, to pad the start and end with matching room tone. */
function roomTone(x: Float32Array, rate: number, seconds: number): Float32Array {
  const map = findPauses(frames(x, rate), 200);
  const edge = Math.round(rate * 0.05);
  const best = map.pauses.sort((a, b) => b.endMs - b.startMs - (a.endMs - a.startMs))[0];
  let src: Float32Array;
  if (best && best.endMs - best.startMs >= 300) src = x.subarray(Math.round((best.startMs / 1000) * rate) + edge, Math.round((best.endMs / 1000) * rate) - edge);
  else src = x.subarray(0, Math.max(1, Math.min(x.length, Math.round((map.speechStartMs / 1000) * rate) - edge)));
  const out = new Float32Array(Math.round(seconds * rate));
  if (src.length < 64) return out;
  const fade = Math.min(Math.round(rate * 0.03), Math.floor(src.length / 4));
  let o = 0;
  while (o < out.length) {
    for (let i = 0; i < src.length && o + i < out.length; i++) {
      const g = o > 0 && i < fade ? i / fade : 1;
      out[o + i] = out[o + i] * (1 - g) + src[i] * g;
    }
    o += src.length - fade;
  }
  return out;
}

function joinWithFades(parts: Float32Array[], rate: number): Float32Array {
  const fade = Math.round(rate * 0.02);
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  parts.forEach((p, k) => {
    out.set(p, o);
    if (k > 0) for (let j = 0; j < fade && o - 1 - j >= 0 && o + j < out.length; j++) {
      out[o - 1 - j] *= j / fade;
      out[o + j] *= j / fade;
    }
    o += p.length;
  });
  return out;
}

/** Room tone at both ends to spec: a little of the real lead-in and tail, the rest matching room tone. */
function frame(x: Float32Array, rate: number): Float32Array {
  const map = findPauses(frames(x, rate));
  const pre = Math.round(rate * 0.1);
  const post = Math.round(rate * 0.3);
  const s0 = Math.max(0, Math.round((map.speechStartMs / 1000) * rate) - pre);
  const s1 = Math.min(x.length, Math.round((map.speechEndMs / 1000) * rate) + post);
  const body = x.subarray(s0, s1);
  return joinWithFades([roomTone(x, rate, HEAD_S - 0.1), body, roomTone(x, rate, TAIL_S - 0.3)], rate);
}

/**
 * Quiets the pauses (never the voice) by up to 20 dB when the noise floor would land above spec once the
 * voice is brought up to level. Speech is protected by 60 ms either side, and gain moves smoothly.
 */
function quietPauses(x: Float32Array, rate: number, cutDb: number) {
  if (cutDb <= 0) return;
  const f = frames(x, rate);
  const thr = speechThreshold(f);
  if (thr == null) return;
  const speech = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) if (f[i] > thr) for (let j = Math.max(0, i - 3); j <= Math.min(f.length - 1, i + 3); j++) speech[j] = 1;
  const step = Math.round(rate * FRAME_S);
  const low = lin(-cutDb);
  const k = 1 - Math.exp(-1 / (rate * 0.01));
  let g = 1;
  for (let i = 0; i < x.length; i++) {
    const fi = Math.min(f.length - 1, Math.floor(i / step));
    g += ((speech[fi] ? 1 : low) - g) * k;
    x[i] *= g;
  }
}

/**
 * Brick-wall peak limiter with 5 ms lookahead: the gain dips before a peak arrives and recovers over 80 ms.
 * The smoothed gain never rises above what any sample needs, so nothing passes the ceiling.
 */
function limit(x: Float32Array, rate: number, ceilingDb: number) {
  const ceil = lin(ceilingDb);
  const la = Math.max(1, Math.round(rate * 0.005));
  const n = x.length;
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]);
    need[i] = a > ceil ? ceil / a : 1;
  }
  // Minimum of the next la samples' needs (monotonic deque)
  const ahead = new Float32Array(n);
  const dq = new Int32Array(n);
  let h = 0;
  let t = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (t > h && need[dq[t - 1]] >= need[i]) t--;
    dq[t++] = i;
    while (dq[h] > i + la) h++;
    ahead[i] = need[dq[h]];
  }
  const rel = 1 - Math.exp(-1 / (rate * 0.08));
  let sum = 0;
  let g = 1;
  for (let i = 0; i < n; i++) {
    sum += ahead[i];
    if (i >= la) sum -= ahead[i - la];
    const smooth = sum / Math.min(i + 1, la);
    g = Math.min(smooth, g + (1 - g) * rel);
    x[i] = Math.max(-ceil, Math.min(ceil, x[i] * g));
  }
}

export type Mastered = { samples: Float32Array; rate: number; before: Levels; after: Levels; gainDb: number; cutDb: number; clippedInRecording: boolean };

/** One file, mastered: rumble filter, room tone to spec, level, quieter pauses if needed, peak limit, 44.1 kHz. */
export async function master(pcm: Pcm): Promise<Mastered> {
  let clipped = 0;
  for (let i = 0; i < pcm.data.length; i++) if (pcm.data[i] >= 32700 || pcm.data[i] <= -32700) clipped++;
  let x = await to44k(toFloat(pcm), pcm.rate);
  highPass(x, OUT_RATE);
  x = frame(x, OUT_RATE);
  const before = levels(x, OUT_RATE);
  const gainDb = Math.max(-12, Math.min(30, TARGET_RMS - before.rmsDb));
  const g = lin(gainDb);
  for (let i = 0; i < x.length; i++) x[i] *= g;
  const cutDb = Math.max(0, Math.min(20, before.floorDb + gainDb - FLOOR_TARGET));
  quietPauses(x, OUT_RATE, cutDb);
  limit(x, OUT_RATE, CEILING_DB);
  // Limiting takes a little loudness off; top it back up, at most twice
  for (let pass = 0; pass < 2; pass++) {
    const rms = levels(x, OUT_RATE).rmsDb;
    if (rms >= TARGET_RMS - 0.4) break;
    const extra = lin(Math.min(3, TARGET_RMS - rms));
    for (let i = 0; i < x.length; i++) x[i] *= extra;
    limit(x, OUT_RATE, CEILING_DB);
  }
  return { samples: x, rate: OUT_RATE, before, after: levels(x, OUT_RATE), gainDb, cutDb, clippedInRecording: clipped > 3 };
}

export type Check = { label: string; ok: boolean; detail: string };

/** The store checks, in plain words. A retail sample is judged on length (1–5 minutes) instead of the 120-minute cap. */
export function storeChecks(m: Mastered, kind: "chapter" | "sample" = "chapter"): Check[] {
  const l = m.after;
  const out: Check[] = [
    { label: "Loudness (RMS) between -23 and -18 dB", ok: l.rmsDb >= -23 && l.rmsDb <= -18, detail: `${l.rmsDb.toFixed(1)} dB` },
    { label: "Peaks at or below -3 dB", ok: l.peakDb <= -3, detail: `${l.peakDb.toFixed(1)} dB` },
    {
      label: "Noise floor at or below -60 dB",
      ok: l.floorDb <= -60,
      detail: l.floorDb <= -60 ? `${l.floorDb.toFixed(0)} dB` : `${l.floorDb.toFixed(0)} dB: the room is too noisy for the voice level. Record somewhere quieter or closer to the mic.`,
    },
    { label: "0.5 to 1 second of room tone at the start", ok: l.headS >= 0.5 && l.headS <= 1, detail: `${l.headS.toFixed(2)} s` },
    { label: "1 to 5 seconds of room tone at the end", ok: l.tailS >= 1 && l.tailS <= 5, detail: `${l.tailS.toFixed(2)} s` },
    kind === "sample"
      ? { label: "Retail sample between 1 and 5 minutes", ok: l.minutes >= 1 && l.minutes <= 5, detail: `${l.minutes.toFixed(1)} minutes` }
      : { label: "Under 120 minutes", ok: l.minutes < 120, detail: l.minutes < 120 ? `${l.minutes.toFixed(1)} minutes` : "Split this chapter into two files" },
    { label: "44.1 kHz, 192 kbps constant bit rate MP3, mono", ok: true, detail: "Set by the export" },
  ];
  if (m.clippedInRecording) out.push({ label: "No clipping in the recording", ok: false, detail: "Some of the recording hit the maximum and distorted. Re-record those lines a little quieter." });
  return out;
}

/** 192 kbps constant bit rate MP3, encoded in slices so the page stays responsive. */
export async function encodeMp3(x: Float32Array, onProgress?: (done: number) => void): Promise<Blob> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, OUT_RATE, KBPS);
  const chunks: Uint8Array[] = [];
  const block = 1152 * 40;
  const buf = new Int16Array(block);
  for (let i = 0; i < x.length; i += block) {
    const n = Math.min(block, x.length - i);
    for (let j = 0; j < n; j++) {
      const s = Math.max(-1, Math.min(1, x[i + j]));
      buf[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const out = enc.encodeBuffer(buf.subarray(0, n));
    if (out.length) chunks.push(out.slice());
    if ((i / block) % 25 === 0) {
      onProgress?.(i / x.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const end = enc.flush();
  if (end.length) chunks.push(end.slice());
  onProgress?.(1);
  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

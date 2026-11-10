/** WAV encoding and the level checks retail audiobooks are judged on. Client-safe, no dependencies. */

/** 16-bit mono PCM WAV: the safe, lossless format every audio tool and store pipeline accepts. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = 44 + samples.length * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Read back a 16-bit mono WAV we wrote (for level checks on saved takes). */
export function decodeWav(buf: ArrayBuffer): { samples: Float32Array; sampleRate: number } {
  const v = new DataView(buf);
  const sampleRate = v.getUint32(24, true);
  const count = (buf.byteLength - 44) / 2;
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) samples[i] = v.getInt16(44 + i * 2, true) / 0x8000;
  return { samples, sampleRate };
}

const toDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);

export function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export type Levels = { peakDb: number; rmsDb: number; noiseFloorDb: number; clipped: number };

/**
 * Peak and loudness (RMS) in dBFS, plus the noise floor: the quietest stretch, measured in 0.5-second windows.
 * ACX asks for RMS between -23 and -18 dB, peaks at or under -3 dB, and a noise floor at or under -60 dB.
 */
export function measure(samples: Float32Array, sampleRate: number): Levels {
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum += samples[i] * samples[i];
  }
  const win = Math.max(1, Math.floor(sampleRate / 2));
  let quietest = Infinity;
  for (let s = 0; s + win <= samples.length; s += win) {
    let w = 0;
    for (let i = s; i < s + win; i++) w += samples[i] * samples[i];
    quietest = Math.min(quietest, Math.sqrt(w / win));
  }
  return {
    peakDb: toDb(peak),
    rmsDb: toDb(Math.sqrt(sum / Math.max(1, samples.length))),
    noiseFloorDb: toDb(quietest === Infinity ? Math.sqrt(sum / Math.max(1, samples.length)) : quietest),
    clipped,
  };
}

/** Plain-language advice from a room check (silence) or a test read. */
export function roomAdvice(l: Levels, kind: "silence" | "voice"): { ok: boolean; message: string }[] {
  const out: { ok: boolean; message: string }[] = [];
  if (kind === "silence") {
    out.push(
      l.noiseFloorDb <= -60
        ? { ok: true, message: `Quiet room: background noise is ${l.noiseFloorDb.toFixed(0)} dB (stores want -60 dB or lower).` }
        : { ok: false, message: `Background noise is ${l.noiseFloorDb.toFixed(0)} dB; stores want -60 dB or lower. Turn off fans or air, move away from computers, or add soft furnishings.` }
    );
  } else {
    if (l.clipped > 0) out.push({ ok: false, message: "Some of that was too loud and clipped. Move back from the mic or turn the input level down." });
    else if (l.peakDb > -3) out.push({ ok: false, message: `Your loudest moments hit ${l.peakDb.toFixed(1)} dB. Leave a little headroom: aim for peaks below -3 dB.` });
    else if (l.peakDb < -24) out.push({ ok: false, message: "That's quite quiet. Move a little closer or turn the input level up; mastering can raise it, but noise comes up too." });
    else out.push({ ok: true, message: `Good level: peaks at ${l.peakDb.toFixed(1)} dB.` });
  }
  return out;
}

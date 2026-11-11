/**
 * A small ID3v2.3 tag writer: the title, author, book, track, and a "This copy belongs to…" comment, written in
 * front of each MP3 a buyer downloads. Text is UTF-16 so any name survives. No dependencies.
 */

function utf16(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out;
}

function frame(id: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(10 + body.length);
  for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
  const n = body.length;
  out[4] = (n >>> 24) & 0xff;
  out[5] = (n >>> 16) & 0xff;
  out[6] = (n >>> 8) & 0xff;
  out[7] = n & 0xff;
  out.set(body, 10);
  return out;
}

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** A text frame (TIT2, TPE1, TALB, TRCK, TCOP…) */
const text = (id: string, value: string) => frame(id, concat([new Uint8Array([1]), utf16(value)]));

/** COMM: encoding, language, an empty description (BOM + double null), then the comment */
const comment = (value: string) => frame("COMM", concat([new Uint8Array([1]), new TextEncoder().encode("eng"), utf16(""), new Uint8Array([0, 0]), utf16(value)]));

export type Id3Fields = { title: string; artist: string; album: string; track: number; trackCount: number; comment: string; copyright?: string };

export function id3Tag(f: Id3Fields): Uint8Array {
  const frames = concat([
    text("TIT2", f.title),
    text("TPE1", f.artist),
    text("TALB", f.album),
    text("TRCK", `${f.track}/${f.trackCount}`),
    text("TCON", "Audiobook"),
    ...(f.copyright ? [text("TCOP", f.copyright)] : []),
    comment(f.comment),
  ]);
  // Synchsafe size: 7 bits per byte
  const n = frames.length;
  const header = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, (n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
  return concat([header, frames]);
}

/** How many bytes an existing ID3v2 tag takes at the start of a file (0 if there isn't one), from its first 10 bytes. */
export function existingTagLength(head: Uint8Array): number {
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0;
  const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
  const footer = head[5] & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

/**
 * Copy protection for beta and ARC readers. Nothing stops a screenshot, so the aim is to stop casual copying and
 * make a leak traceable: a reader's code is hidden in copied quotes and downloaded copies as invisible characters.
 */

/** Longest passage a reader can copy, enough for a review quote. */
export const QUOTE_LIMIT = 280;

const ZERO = "\u200B";
const ONE = "\u200C";
const EDGE = "\u2060";
const CODE_HEX = 10;

/** A reader's code: the start of their invite id, 40 bits, unique within one author's readers. */
export const traceCode = (inviteId: string) => inviteId.replace(/-/g, "").slice(0, CODE_HEX).toLowerCase();

/** The code as invisible characters. */
export function encodeTrace(code: string): string {
  const bits = [...code].map((h) => parseInt(h, 16).toString(2).padStart(4, "0")).join("");
  return EDGE + [...bits].map((b) => (b === "1" ? ONE : ZERO)).join("") + EDGE;
}

/** Every code hidden in a pasted passage. */
export function decodeTraces(text: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(`${EDGE}([${ZERO}${ONE}]{${CODE_HEX * 4}})${EDGE}`, "g");
  for (const m of text.matchAll(re)) {
    const bits = [...m[1]].map((c) => (c === ONE ? "1" : "0")).join("");
    found.add(bits.match(/.{4}/g)!.map((b) => parseInt(b, 2).toString(16)).join(""));
  }
  return [...found];
}

/**
 * Hides the code at the end of each paragraph of prose, for downloaded copies (never the on-screen text, which
 * comments anchor to). Short lines like scene breaks are left alone, and the start stays clean for drop caps.
 */
export function markParagraphs(html: string, code: string): string {
  const mark = encodeTrace(code);
  return html.replace(/(<p(?:\s[^>]*)?>)([\s\S]*?)(<\/p>)/gi, (whole, open: string, inner: string, close: string) =>
    inner.replace(/<[^>]+>/g, "").trim().length >= 40 ? open + inner + mark + close : whole
  );
}

/** A faint, repeating name-and-email mark behind the text, as a CSS background. */
export function watermarkBackground(label: string): string {
  const safe = label.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><text x="20" y="130" transform="rotate(-24 210 110)" font-family="sans-serif" font-size="15" fill="rgba(120,120,120,0.13)">${safe}</text></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

import "server-only";
import { createHash } from "crypto";
import mammoth from "mammoth";
import { editingHeading } from "@/lib/export";

/**
 * Review edits: an editor's returned Word file compared with the book, paragraph by paragraph. Word's tracked
 * changes arrive accepted (insertions kept, deletions dropped), and the author accepts or rejects each changed
 * paragraph here before anything in the book changes.
 */

/** One paragraph of the book as it appears in the editing manuscript: a <p>, a scene break, or an image placeholder. */
type Unit = { start: number; end: number; text: string; attrs: string };
export type Segment = { t: "same" | "del" | "ins"; s: string };
export type EditChange = {
  id: string;
  kind: "change" | "insert" | "delete";
  /** The book's paragraph it replaces or removes, or (for an insert) the one it follows; -1 is the chapter's start */
  unit: number;
  /** Position among the returned file's paragraphs, which keeps several inserts in their order */
  order: number;
  before: string;
  after: string;
  afterHtml: string;
  diff: Segment[];
};
export type ChapterReview = { chapterId: string; title: string; matched: boolean; changes: EditChange[] };

const decode = (s: string) =>
  s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const plain = (html: string) => decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const words = (s: string) => (s ? s.split(" ").filter(Boolean).length : 0);

/** The book's paragraphs, in the same order the editing manuscript wrote them. */
function bookUnits(html: string): Unit[] {
  const out: Unit[] = [];
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>|<hr\b[^>]*\/?>|<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0].slice(0, 3).toLowerCase();
    const text = tag === "<p " || tag === "<p>" ? plain(m[2]) : tag === "<hr" ? "⁂" : /data-role="break"/i.test(m[3] || "") ? "⁂" : `[Image${/alt="([^"]+)"/i.exec(m[3] || "")?.[1] ? `: ${/alt="([^"]+)"/i.exec(m[3] || "")![1]}` : ""}]`;
    out.push({ start: m.index, end: m.index + m[0].length, text, attrs: m[1] || "" });
  }
  return out;
}

/** Keep only the inline formatting the editor understands (italics, bold, underline, line breaks). */
const cleanInline = (html: string) =>
  html
    .replace(/<(\/?)(em|i|strong|b|u)\b[^>]*>/gi, "<$1$2>")
    .replace(/<br\s*\/?>/gi, "<br/>")
    .replace(/<(?!\/?(em|i|strong|b|u)>|br\/>)[^>]+>/gi, "")
    .trim();

/** The returned file, split into chapters at each Heading 1. */
async function editedSections(buf: Buffer) {
  const { value } = await mammoth.convertToHtml({ buffer: buf });
  const parts = value.split(/<h1\b[^>]*>/i).slice(1);
  return parts.map((part) => {
    const end = part.search(/<\/h1>/i);
    const title = plain(part.slice(0, end));
    const body = part.slice(end + 5);
    const paras: { text: string; html: string }[] = [];
    const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const html = cleanInline(m[1]);
      paras.push({ text: plain(html), html });
    }
    return { title, paras };
  });
}

/** Longest common subsequence of two lists, as matched index pairs. */
function lcs<A, B>(a: A[], b: B[], eq: (x: A, y: B) => boolean): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** Word-level difference, for showing what changed inside a paragraph. */
export function wordDiff(before: string, after: string): Segment[] {
  const a = before.split(/(\s+)/).filter((x) => x && !/^\s+$/.test(x));
  const b = after.split(/(\s+)/).filter((x) => x && !/^\s+$/.test(x));
  if (a.length * b.length > 250_000) return [{ t: "del", s: before }, { t: "ins", s: after }];
  const pairs = lcs(a, b, (x, y) => x === y);
  const out: Segment[] = [];
  const push = (t: Segment["t"], s: string) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += ` ${s}`;
    else out.push({ t, s });
  };
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...pairs, [a.length, b.length] as [number, number]]) {
    while (i < pi) push("del", a[i++]);
    while (j < pj) push("ins", b[j++]);
    if (pi < a.length) push("same", a[pi]);
    i = pi + 1;
    j = pj + 1;
  }
  return out;
}

/** A fingerprint of the chapters as they are now, so changes are only applied to the text they were worked out from. */
export const basisOf = (chapters: { id: string; content_html: string | null }[]) =>
  createHash("sha256")
    .update(chapters.map((c) => `${c.id}:${c.content_html || ""}`).join("\n"))
    .digest("hex")
    .slice(0, 24);

/** Every changed paragraph in the returned file, chapter by chapter. */
export async function reviewEdits(buf: Buffer, chapters: { id: string; title: string | null; sort_order: number; content_html: string | null }[]): Promise<ChapterReview[]> {
  const ordered = [...chapters].sort((a, b) => a.sort_order - b.sort_order);
  const sections = await editedSections(buf);
  const byTitle = new Map(sections.map((s) => [s.title.toLowerCase(), s]));
  return ordered.map((ch, i) => {
    const heading = editingHeading(ch, i);
    const section = sections.length === ordered.length ? sections[i] : byTitle.get(heading.toLowerCase());
    if (!section) return { chapterId: ch.id, title: heading, matched: false, changes: [] };
    const units = bookUnits(ch.content_html || "");
    const pairs = lcs(units, section.paras, (u, p) => u.text === p.text);
    const changes: EditChange[] = [];
    let ui = 0;
    let pi = 0;
    for (const [mu, mp] of [...pairs, [units.length, section.paras.length] as [number, number]]) {
      // Between two matching paragraphs: pair them up in order as changes, then any extras are deletions or insertions
      const gone = units.slice(ui, mu).map((_, k) => ui + k);
      const added = section.paras.slice(pi, mp);
      const paired = Math.min(gone.length, added.length);
      for (let k = 0; k < paired; k++) {
        const u = units[gone[k]];
        changes.push({ id: `${ch.id}:c${gone[k]}`, kind: "change", unit: gone[k], order: pi + k, before: u.text, after: added[k].text, afterHtml: added[k].html, diff: wordDiff(u.text, added[k].text) });
      }
      for (let k = paired; k < gone.length; k++) {
        const u = units[gone[k]];
        changes.push({ id: `${ch.id}:d${gone[k]}`, kind: "delete", unit: gone[k], order: pi + paired, before: u.text, after: "", afterHtml: "", diff: [{ t: "del", s: u.text }] });
      }
      const anchor = paired ? gone[paired - 1] : ui - 1;
      for (let k = paired; k < added.length; k++) {
        changes.push({ id: `${ch.id}:i${anchor}-${pi + k}`, kind: "insert", unit: anchor, order: pi + k, before: "", after: added[k].text, afterHtml: added[k].html, diff: [{ t: "ins", s: added[k].text }] });
      }
      ui = mu + 1;
      pi = mp + 1;
    }
    return { chapterId: ch.id, title: heading, matched: true, changes };
  });
}

/** The chapter's HTML with the accepted changes applied; unchanged paragraphs keep their exact HTML. */
export function applyToChapter(html: string, changes: EditChange[]) {
  const units = bookUnits(html);
  let out = html;
  let wordsChanged = 0;
  // From the end so earlier offsets stay valid. Inserts after a paragraph go in before that paragraph itself changes
  // (they sit past its end), and the last insert goes in first so they read in order.
  const sorted = [...changes].sort((a, b) => b.unit - a.unit || (b.kind === "insert" ? 1 : 0) - (a.kind === "insert" ? 1 : 0) || b.order - a.order);
  for (const c of sorted) {
    const u = c.unit >= 0 ? units[c.unit] : null;
    if (c.kind === "insert") {
      const at = u ? u.end : 0;
      out = `${out.slice(0, at)}<p>${c.afterHtml}</p>${out.slice(at)}`;
      wordsChanged += words(c.after);
    } else if (u && c.kind === "delete") {
      out = out.slice(0, u.start) + out.slice(u.end);
      wordsChanged += words(c.before);
    } else if (u) {
      out = `${out.slice(0, u.start)}<p${u.attrs}>${c.afterHtml}</p>${out.slice(u.end)}`;
      wordsChanged += wordDiff(c.before, c.after).filter((s) => s.t !== "same").reduce((n, s) => n + words(s.s), 0);
    }
  }
  return { html: out, text: textOf(out), wordsChanged };
}

/** Plain text with a blank line between paragraphs, as chapters store it. */
const textOf = (html: string) =>
  decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<hr\b[^>]*\/?>/gi, "\n\n⁂\n\n").replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const countWords = (html: string) => words(plain(html));

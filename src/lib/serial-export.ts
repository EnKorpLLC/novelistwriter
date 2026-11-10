/**
 * Paste-ready chapters for serial sites. Client-safe: built in the browser from the chapter the author is looking at.
 * Every format keeps italics, bold, and scene breaks; nothing is ever posted for the author.
 */
import { decodeEntities, escapeXml, htmlToBlocks, type Block } from "@/lib/book/model";

export type SerialFormat = "rich" | "html" | "bbcode" | "markdown" | "text";

export type SerialPlatform = {
  id: string;
  label: string;
  format: SerialFormat;
  /** Some editors drop horizontal rules, so breaks become a centered "* * *" */
  breakAs: "hr" | "stars";
  howTo: string;
};

export const SERIAL_PLATFORMS: SerialPlatform[] = [
  { id: "royalroad", label: "Royal Road", format: "rich", breakAs: "hr", howTo: "Copy, then paste into the chapter content box. Using Royal Road's own author's note boxes instead? Leave the note below empty." },
  { id: "wattpad", label: "Wattpad", format: "rich", breakAs: "stars", howTo: "Copy, then paste into a new part. Wattpad drops divider lines, so scene breaks are centered * * *." },
  { id: "substack", label: "Substack", format: "rich", breakAs: "hr", howTo: "Copy, then paste into a new post. Scene breaks become Substack dividers." },
  { id: "ao3", label: "AO3", format: "html", breakAs: "hr", howTo: "In AO3's chapter editor, switch to HTML, then paste." },
  { id: "scribblehub", label: "Scribble Hub", format: "rich", breakAs: "hr", howTo: "Copy, then paste into the chapter editor." },
  { id: "tapas", label: "Tapas", format: "rich", breakAs: "stars", howTo: "Copy, then paste into a new episode." },
  { id: "readerful", label: "Readerful", format: "rich", breakAs: "stars", howTo: "Copy, then paste into the chapter editor." },
  { id: "lantern", label: "Lantern", format: "rich", breakAs: "stars", howTo: "Copy, then paste into the chapter editor." },
  { id: "forums", label: "SpaceBattles / Sufficient Velocity", format: "bbcode", breakAs: "stars", howTo: "Paste into a new threadmark post. Uses BBCode." },
  { id: "reddit", label: "Reddit", format: "markdown", breakAs: "hr", howTo: "Switch the post editor to Markdown mode, then paste." },
  { id: "text", label: "Plain text", format: "text", breakAs: "stars", howTo: "No formatting at all, for anywhere else." },
];

export function serialPlatform(id: string) {
  return SERIAL_PLATFORMS.find((p) => p.id === id) || null;
}

/* ---------- Inline marks (the allow-listed HTML the block model produces) ---------- */

type Mark = "em" | "strong" | "u" | "s" | "sup" | "sub" | "code" | "a";
const TOKEN = /<(\/?)(em|strong|u|s|sup|sub|code|a)((?:\s+href="[^"]*")?)>|<br\/?>|([^<]+)/g;

function convertInline(html: string, out: (piece: { open?: Mark; close?: Mark; href?: string; br?: true; text?: string }) => string) {
  let s = "";
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(html))) {
    if (m[4] !== undefined) s += out({ text: decodeEntities(m[4]) });
    else if (m[0].startsWith("<br")) s += out({ br: true });
    else if (m[1]) s += out({ close: m[2] as Mark });
    else s += out({ open: m[2] as Mark, href: decodeEntities(/href="([^"]*)"/.exec(m[3])?.[1] || "") });
  }
  return s;
}

const BB: Partial<Record<Mark, string>> = { em: "i", strong: "b", u: "u", s: "s", sup: "sup", sub: "sub", code: "icode" };
function bbInline(html: string) {
  return convertInline(html, (p) => {
    if (p.text !== undefined) return p.text.replace(/\[/g, "[\u200b");
    if (p.br) return "\n";
    if (p.open === "a") return `[url=${p.href}]`;
    if (p.close === "a") return "[/url]";
    const tag = BB[(p.open || p.close)!];
    return tag ? (p.open ? `[${tag}]` : `[/${tag}]`) : "";
  });
}

const MD: Partial<Record<Mark, string>> = { em: "*", strong: "**", s: "~~", code: "`", sup: "^" };
const mdLinks: string[] = [];
function mdInline(html: string) {
  return convertInline(html, (p) => {
    if (p.text !== undefined) return p.text.replace(/([\\*_`~[\]^#>])/g, "\\$1");
    if (p.br) return "  \n";
    if (p.open === "a") {
      mdLinks.push(p.href || "");
      return "[";
    }
    if (p.close === "a") return `](${mdLinks.pop() || ""})`;
    if (p.open === "sup" || p.close === "sup") return p.open ? "^(" : ")";
    return MD[(p.open || p.close)!] || "";
  });
}

function textInline(html: string) {
  return convertInline(html, (p) => (p.text !== undefined ? p.text : p.br ? "\n" : ""));
}

/* ---------- Blocks ---------- */

/**
 * Images aren't pasted as links to our storage (every reader on the other site would load them from us).
 * A marker shows where to upload the image on that site instead.
 */
function imageMarker(b: Extract<Block, { type: "image" }>) {
  if (b.role === "break") return "* * *";
  return `[Image${b.alt ? `: ${b.alt}` : ""}. Upload it here on this site]`;
}

const STARS_HTML = '<p style="text-align: center">* * *</p>';

function richBlocks(blocks: Block[], breakAs: "hr" | "stars"): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return b.align === "left" ? `<p>${b.html}</p>` : `<p style="text-align: ${b.align}">${b.html}</p>`;
        case "heading":
          return `<h3>${b.html}</h3>`;
        case "quote":
          return `<blockquote>${richBlocks(b.blocks, breakAs)}</blockquote>`;
        case "list":
          return `<${b.ordered ? "ol" : "ul"}>${b.items.map((i) => `<li>${i}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
        case "break":
          return breakAs === "hr" ? "<hr />" : STARS_HTML;
        case "pre":
          return `<pre>${escapeXml(b.text)}</pre>`;
        case "image":
          if (b.role === "break") return breakAs === "hr" ? "<hr />" : STARS_HTML;
          return `<p style="text-align: center"><em>${escapeXml(imageMarker(b))}</em></p>`;
      }
    })
    .join("\n");
}

function bbBlocks(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return b.align === "left" ? bbInline(b.html) : `[${b.align}]${bbInline(b.html)}[/${b.align}]`;
        case "heading":
          return `[b]${bbInline(b.html)}[/b]`;
        case "quote":
          return `[quote]${bbBlocks(b.blocks)}[/quote]`;
        case "list":
          return `[list${b.ordered ? "=1" : ""}]\n${b.items.map((i) => `[*]${bbInline(i)}`).join("\n")}\n[/list]`;
        case "break":
          return "[center]* * *[/center]";
        case "pre":
          return `[code]${b.text}[/code]`;
        case "image":
          return b.role === "break" ? "[center]* * *[/center]" : `[center][i]${imageMarker(b)}[/i][/center]`;
      }
    })
    .join("\n\n");
}

function mdBlocks(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return mdInline(b.html);
        case "heading":
          return `### ${mdInline(b.html)}`;
        case "quote":
          return mdBlocks(b.blocks)
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n");
        case "list":
          return b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : "-"} ${mdInline(i)}`).join("\n");
        case "break":
          return "* * *";
        case "pre":
          return b.text
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n");
        case "image":
          return b.role === "break" ? "* * *" : `*${imageMarker(b).replace(/([\\*_`~[\]^#>])/g, "\\$1")}*`;
      }
    })
    .join("\n\n");
}

function textBlocks(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "p":
        case "heading":
          return textInline(b.html);
        case "quote":
          return textBlocks(b.blocks);
        case "list":
          return b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : "•"} ${textInline(i)}`).join("\n");
        case "break":
          return "* * *";
        case "pre":
          return b.text;
        case "image":
          return imageMarker(b);
      }
    })
    .join("\n\n");
}

export type SerialChapterExport = {
  /** What gets copied: rich formats copy as formatted text with this HTML behind it */
  html: string | null;
  text: string;
  words: number;
};

/** One chapter, ready to paste into the chosen site. The author's note goes at the end, after a break. */
export function exportSerialChapter(
  chapter: { content_html: string | null; content_text?: string | null; word_count?: number | null },
  platform: SerialPlatform,
  noteAfter = ""
): SerialChapterExport {
  const blocks = htmlToBlocks(chapter.content_html, chapter.content_text);
  const note = noteAfter.trim();
  const noteBlocks: Block[] = note
    ? [{ type: "break" }, ...note.split(/\n{2,}/).map((t) => ({ type: "p" as const, html: escapeXml(t.trim()).replace(/\n/g, "<br/>"), align: "left" as const }))]
    : [];
  const all = [...blocks, ...noteBlocks];
  const plain = textBlocks(all);
  const words = chapter.word_count || (textBlocks(blocks).match(/\S+/g) || []).length;
  switch (platform.format) {
    case "rich":
    case "html":
      return { html: richBlocks(all, platform.breakAs), text: plain, words };
    case "bbcode":
      return { html: null, text: bbBlocks(all), words };
    case "markdown":
      return { html: null, text: mdBlocks(all), words };
    default:
      return { html: null, text: plain, words };
  }
}

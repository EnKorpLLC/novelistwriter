/**
 * One parser for every output (ebook, previews, Word, print): TipTap chapter HTML in, clean blocks out.
 * Client-safe and dependency-free. Inline HTML is rebuilt from an allow-list, so the output is valid XHTML.
 */
import {
  chapterLabel,
  chapterName,
  detectChapterKind,
  type BookDetails,
  type ChapterKind,
  type FormatSettings,
  type HeadingFormat,
} from "@/lib/book/format";

export type Block =
  | { type: "p"; html: string; align: "left" | "center" | "right" }
  | { type: "heading"; level: number; html: string }
  | { type: "quote"; blocks: Block[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "break" }
  | { type: "pre"; text: string };

type Node = { tag: string; attrs: string; children: Node[] } | { text: string };

const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "wbr"]);

/** Small tolerant HTML parser: enough for editor output and imported paragraphs. */
export function parseHtml(html: string): Node[] {
  const root: { tag: string; attrs: string; children: Node[] } = { tag: "#root", attrs: "", children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("<!--")) continue;
    const top = stack[stack.length - 1];
    if (m[5] !== undefined || m[0] === "<") {
      top.children.push({ text: m[5] ?? "<" });
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const idx = stack.map((n) => n.tag).lastIndexOf(tag);
      if (idx > 0) stack.length = idx;
      continue;
    }
    const node = { tag, attrs: m[3] || "", children: [] as Node[] };
    top.children.push(node);
    if (!m[4] && !VOID.has(tag)) stack.push(node);
  }
  return root.children;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", mdash: "—", ndash: "–", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", shy: "\u00ad",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const INLINE_MAP: Record<string, string> = { em: "em", i: "em", strong: "strong", b: "strong", u: "u", s: "s", strike: "s", sup: "sup", sub: "sub", code: "code" };

/** Rebuild inline content from allowed marks only; everything else is unwrapped to its text. */
function inlineHtml(nodes: Node[]): string {
  let out = "";
  for (const n of nodes) {
    if ("text" in n) {
      out += escapeXml(decodeEntities(n.text).replace(/[\r\n\t]+/g, " "));
      continue;
    }
    if (n.tag === "br") {
      out += "<br/>";
      continue;
    }
    const inner = inlineHtml(n.children);
    if (n.tag === "a") {
      const href = decodeEntities(/href\s*=\s*"([^"]*)"/i.exec(n.attrs)?.[1] || "");
      out += /^(https?:|mailto:)/i.test(href) && inner ? `<a href="${escapeXml(href)}">${inner}</a>` : inner;
      continue;
    }
    const mapped = INLINE_MAP[n.tag];
    out += mapped && inner ? `<${mapped}>${inner}</${mapped}>` : inner;
  }
  return out;
}

export function plainText(nodes: Node[]): string {
  return nodes.map((n) => ("text" in n ? decodeEntities(n.text) : n.tag === "br" ? "\n" : plainText(n.children))).join("");
}

function alignOf(attrs: string): "left" | "center" | "right" {
  const m = /text-align\s*:\s*(center|right)/i.exec(attrs);
  return (m?.[1]?.toLowerCase() as "center" | "right") || "left";
}

const SCENE_BREAK_TEXT = /^\s*(?:(?:\*\s*){3,}|(?:•\s*){3,}|(?:~\s*){1,}|#|⁂|§|◆|-{3,}|—{2,}|_{3,})\s*$/;

function toBlocks(nodes: Node[]): Block[] {
  const blocks: Block[] = [];
  for (const n of nodes) {
    if ("text" in n) {
      const text = decodeEntities(n.text).trim();
      if (text) blocks.push({ type: "p", html: escapeXml(text), align: "left" });
      continue;
    }
    switch (n.tag) {
      case "p": {
        const text = plainText(n.children);
        if (!text.trim()) break;
        if (SCENE_BREAK_TEXT.test(text)) blocks.push({ type: "break" });
        else blocks.push({ type: "p", html: inlineHtml(n.children).trim(), align: alignOf(n.attrs) });
        break;
      }
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const html = inlineHtml(n.children).trim();
        if (html) blocks.push({ type: "heading", level: Math.max(2, Number(n.tag[1])), html });
        break;
      }
      case "blockquote": {
        const inner = toBlocks(n.children);
        if (inner.length) blocks.push({ type: "quote", blocks: inner });
        break;
      }
      case "ul":
      case "ol": {
        const items = n.children
          .filter((c): c is { tag: string; attrs: string; children: Node[] } => !("text" in c) && c.tag === "li")
          .map((li) =>
            li.children
              .map((c) => ("text" in c ? escapeXml(decodeEntities(c.text)) : c.tag === "p" ? inlineHtml(c.children) : inlineHtml([c])))
              .filter((s) => s.trim())
              .join("<br/>")
          )
          .filter((s) => s.trim());
        if (items.length) blocks.push({ type: "list", ordered: n.tag === "ol", items });
        break;
      }
      case "hr":
        blocks.push({ type: "break" });
        break;
      case "pre":
        blocks.push({ type: "pre", text: plainText(n.children) });
        break;
      default:
        // div, section, span wrappers: look inside
        blocks.push(...toBlocks(n.children));
    }
  }
  // No scene break at the very start or end of a chapter, and never two in a row
  return blocks.filter((b, i, all) => b.type !== "break" || (i > 0 && i < all.length - 1 && all[i - 1].type !== "break"));
}

export function htmlToBlocks(html: string | null | undefined, fallbackText?: string | null): Block[] {
  if (html && html.trim()) return toBlocks(parseHtml(html));
  return String(fallbackText || "")
    .split(/\n{2,}|\r\n\r\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (SCENE_BREAK_TEXT.test(t) ? ({ type: "break" } as Block) : { type: "p", html: escapeXml(t).replace(/\n/g, "<br/>"), align: "left" }));
}

export function blocksAreEmpty(blocks: Block[]) {
  return blocks.length === 0;
}

/* ---------- The whole book ---------- */

export type MatterInput = { id?: string; matter_type: string; title: string; content_html: string; enabled: boolean; sort_order: number };
export type ChapterInput = { id: string; title: string; content_html: string | null; content_text?: string | null; sort_order: number };

export type BookChapter = {
  id: string;
  kind: ChapterKind;
  number: number | null;
  label: string | null;
  name: string;
  tocLabel: string;
  blocks: Block[];
};

export type BookSection = {
  id: string;
  kind: string;
  title: string;
  /** Show the title as a heading on the page */
  showTitle: boolean;
  blocks: Block[];
  /** Generated pages (title page, copyright, contents) render from structured data */
  special?: "title" | "copyright" | "toc";
};

export type BookExtras = {
  alsoBy?: { title: string; series?: string; url?: string | null }[];
  reviewLink?: { label: string; url: string } | null;
  newsletterUrl?: string | null;
  recordUrl?: string | null;
};

export type Book = {
  title: string;
  subtitle: string;
  author: string;
  details: BookDetails;
  format: FormatSettings;
  headingFormat: HeadingFormat;
  front: BookSection[];
  chapters: BookChapter[];
  back: BookSection[];
};

const linkP = (text: string, url: string) => `<p>${escapeXml(text)} <a href="${escapeXml(url)}">${escapeXml(url)}</a></p>`;

export function buildBook(input: {
  title: string;
  subtitle?: string;
  author: string;
  details: BookDetails;
  format: FormatSettings;
  styleHeadingFormat: HeadingFormat;
  chapters: ChapterInput[];
  matter: MatterInput[];
  extras?: BookExtras;
}): Book {
  const { details, format } = input;
  const extras = input.extras || {};
  const headingFormat = format.headingFormat || input.styleHeadingFormat;
  const author = details.penName || input.author;

  let n = 0;
  const chapters: BookChapter[] = [...input.chapters]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => {
      const kind = format.chapterKinds[c.id] || detectChapterKind(c.title);
      const name = kind === "chapter" ? chapterName(c.title) : c.title.trim();
      const number = kind === "chapter" ? ++n : null;
      const label = number != null ? chapterLabel(headingFormat, number) : null;
      const shownName = format.showChapterTitles || !label ? name : "";
      return {
        id: c.id,
        kind,
        number,
        label,
        name: shownName,
        tocLabel: [label, shownName].filter(Boolean).join(": ") || name || `Chapter ${number ?? ""}`.trim(),
        blocks: htmlToBlocks(c.content_html, c.content_text),
      };
    });

  const enabled = [...input.matter].filter((m) => m.enabled).sort((a, b) => a.sort_order - b.sort_order);
  const section = (m: MatterInput, blocks: Block[], showTitle = true, special?: BookSection["special"]): BookSection => ({
    id: m.id || m.matter_type,
    kind: m.matter_type,
    title: m.title || m.matter_type,
    showTitle,
    blocks,
    special,
  });

  const front: BookSection[] = [];
  if (format.titlePage) {
    front.push({ id: "title-page", kind: "title_page", title: "Title Page", showTitle: false, blocks: [], special: "title" });
  }
  for (const m of enabled.filter((x) => x.matter_type.startsWith("front_"))) {
    const blocks = htmlToBlocks(m.content_html);
    if (m.matter_type === "front_toc") {
      front.push(section(m, [], true, "toc"));
    } else if (m.matter_type === "front_copyright") {
      if (format.autoCopyright && blocksAreEmpty(blocks)) front.push(section(m, [], false, "copyright"));
      else if (blocks.length) front.push(section(m, blocks, false));
    } else if (m.matter_type === "front_dedication" || m.matter_type === "front_epigraph") {
      if (blocks.length) front.push(section(m, blocks, false));
    } else if (blocks.length) {
      front.push(section(m, blocks));
    }
  }

  const back: BookSection[] = [];
  for (const m of enabled.filter((x) => x.matter_type.startsWith("back_"))) {
    let blocks = htmlToBlocks(m.content_html);
    if (blocksAreEmpty(blocks)) {
      if (m.matter_type === "back_also_by" && format.autoAlsoBy && extras.alsoBy?.length) {
        const html = extras.alsoBy
          .map((b) => {
            const label = `${escapeXml(b.title)}${b.series ? ` <em>(${escapeXml(b.series)})</em>` : ""}`;
            return `<p>${b.url ? `<a href="${escapeXml(b.url)}">${label}</a>` : label}</p>`;
          })
          .join("");
        blocks = htmlToBlocks(html);
      } else if (m.matter_type === "back_review_request" && extras.reviewLink) {
        blocks = htmlToBlocks(
          `<p>Thank you for reading <em>${escapeXml(input.title)}</em>. If you enjoyed it, a short, honest review helps other readers find it.</p>${linkP(`Leave a review on ${extras.reviewLink.label}:`, extras.reviewLink.url)}`
        );
      } else if (m.matter_type === "back_newsletter" && extras.newsletterUrl) {
        blocks = htmlToBlocks(
          `<p>Want to know when the next book is out? Join ${escapeXml(author)}'s reader list for news, early chapters, and advance copies.</p>${linkP("Sign up:", extras.newsletterUrl)}`
        );
      }
    }
    if (blocks.length) back.push(section(m, blocks));
  }

  return {
    title: input.title,
    subtitle: input.subtitle || "",
    author,
    details,
    format,
    headingFormat,
    front,
    chapters,
    back,
  };
}

/** Copyright page text from book details. */
export function copyrightLines(book: Book, recordUrl?: string | null): string[] {
  const d = book.details;
  const year = d.copyrightYear || String(new Date().getFullYear());
  const lines = [
    `Copyright © ${year} ${d.copyrightHolder || book.author}`,
    "All rights reserved. No part of this book may be reproduced in any form without written permission from the author, except for brief quotations in reviews.",
    "This is a work of fiction. Names, characters, places, and events are the product of the author's imagination or are used fictitiously.",
  ];
  if (d.isbnEbook) lines.push(`ISBN (ebook): ${d.isbnEbook}`);
  if (d.isbnPrint) lines.push(`ISBN (print): ${d.isbnPrint}`);
  if (d.edition) lines.push(d.edition);
  if (d.imprint) lines.push(`Published by ${d.imprint}`);
  if (d.humanStatement) {
    lines.push(
      recordUrl
        ? `Written by a human in Novelist Writer. See how this book was written: ${recordUrl}`
        : "Written by a human in Novelist Writer."
    );
  }
  return lines;
}

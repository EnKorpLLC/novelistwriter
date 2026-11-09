/** Novelist 2.0–style DOCX: title, optional front matter, Contents, Chapter N: Title, optional back matter */
import { decodeEntities, htmlToBlocks, parseHtml, plainText, type Block } from "@/lib/book/model";

/* ---------- Chapters from any Word file (Scrivener, Word, Google Docs exports) ---------- */

const CHAPTER_LINE = /^(chapter\s+([0-9]+|[a-z-]+)\b|prologue\b|epilogue\b|interlude\b|part\s+([0-9]+|[ivxlc]+|[a-z]+)\b)/i;
const BACK_LINE = /^(about the author|also by|acknowledg|newsletter|stay in touch|sample chapter|excerpt)/i;

function blocksToEditorHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return `<p${b.align !== "left" ? ` style="text-align: ${b.align}"` : ""}>${b.html}</p>`;
        case "heading":
          return `<h${Math.min(4, b.level + 1)}>${b.html}</h${Math.min(4, b.level + 1)}>`;
        case "quote":
          return `<blockquote>${blocksToEditorHtml(b.blocks)}</blockquote>`;
        case "list":
          return `<${b.ordered ? "ol" : "ul"}>${b.items.map((i) => `<li><p>${i}</p></li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
        case "break":
          return `<p style="text-align: center">* * *</p>`;
        case "pre":
          return `<p>${b.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`;
      }
    })
    .join("");
}

/**
 * Splits converted Word HTML into chapters at heading styles or lines like "Chapter One", "CHAPTER 1",
 * "Prologue", or "Part Two". Keeps italics, bold, lists, and scene breaks. Empty when it finds no chapters.
 */
export function chaptersFromDocxHtml(html: string): { title: string; html: string; text: string }[] {
  const top = parseHtml(html).filter((n) => "tag" in n) as { tag: string; attrs: string; children: never[] }[];
  const info = top.map((node) => {
    const text = decodeEntities(plainText([node])).replace(/\s+/g, " ").trim();
    const heading = /^h[1-2]$/.test(node.tag) && text.length > 0;
    return { node, text, heading, chapterLike: text.length > 0 && text.length <= 100 && CHAPTER_LINE.test(text) };
  });
  const FRONT_LINE = /^(copyright|dedication|contents|table of contents|epigraph|title page)$/i;
  // With "Chapter…" lines in the file, chapters start at the first one; the title and front pages come before it
  const firstChapterLike = info.findIndex((i) => i.chapterLike);
  let start = firstChapterLike >= 0 ? firstChapterLike : 0;
  if (firstChapterLike < 0) {
    // Heading styles only: a first heading followed by little text is the book's title
    const headings = info.map((x, idx) => (x.heading ? idx : -1)).filter((idx) => idx >= 0);
    if (headings.length >= 3) {
      const between = info.slice(headings[0] + 1, headings[1]).reduce((n, x) => n + x.text.split(/\s+/).filter(Boolean).length, 0);
      if (between < 50) start = headings[0] + 1;
    }
  }

  const chapters: { title: string; parts: string[] }[] = [];
  let current: { title: string; parts: string[] } | null = null;
  for (const { node, text, heading, chapterLike } of info.slice(start)) {
    if (current && text && BACK_LINE.test(text) && (heading || text.length <= 60)) break;
    if ((heading && !FRONT_LINE.test(text) && (firstChapterLike < 0 || chapterLike || chapters.length > 0)) || chapterLike) {
      current = { title: text, parts: [] };
      chapters.push(current);
      continue;
    }
    if (current) current.parts.push(serialize(node));
  }
  return chapters.map((c) => {
    const body = blocksToEditorHtml(htmlToBlocks(c.parts.join("")));
    return { title: c.title, html: body, text: decodeEntities(body.replace(/<\/p>/g, "\n\n").replace(/<[^>]+>/g, "")).trim() };
  });
}

function serialize(node: { tag: string; attrs: string; children: unknown[] } | { text: string }): string {
  if ("text" in node) return node.text;
  if (/^(br|hr|img|wbr)$/i.test(node.tag)) return `<${node.tag}${node.attrs ? ` ${node.attrs}` : ""}/>`;
  const inner = (node.children as ({ tag: string; attrs: string; children: unknown[] } | { text: string })[]).map(serialize).join("");
  return `<${node.tag}${node.attrs ? ` ${node.attrs}` : ""}>${inner}</${node.tag}>`;
}

export type ParsedMatter = {
  matter_type: string;
  title: string;
  content: string;
  enabled: boolean;
};

export type ParsedDocxProject = {
  title: string;
  chapters: { title: string; body: string; number: number }[];
  frontMatter: ParsedMatter[];
  backMatter: ParsedMatter[];
};

const CHAPTER_SPLIT = /\n(?=Chapter\s+\d+\s*:)/i;
const CHAPTER_HEAD = /^Chapter\s+(\d+)\s*:\s*(.*)$/i;

const FRONT_HEADINGS: { re: RegExp; matter_type: string; title: string }[] = [
  { re: /^copyright$/i, matter_type: "front_copyright", title: "Copyright" },
  { re: /^dedication$/i, matter_type: "front_dedication", title: "Dedication" },
  { re: /^epigraph$/i, matter_type: "front_epigraph", title: "Epigraph" },
  { re: /^(contents|table of contents|toc)$/i, matter_type: "front_toc", title: "Contents" },
  { re: /^acknowledg?ements?$/i, matter_type: "front_dedication", title: "Acknowledgments" },
];

const BACK_HEADINGS: { re: RegExp; matter_type: string; title: string }[] = [
  { re: /^about the author$/i, matter_type: "back_about_author", title: "About the Author" },
  { re: /^(also by|also by the author)$/i, matter_type: "back_also_by", title: "Also by the Author" },
  { re: /^(sample|sample chapter|excerpt)$/i, matter_type: "back_sample", title: "Sample Chapter" },
  { re: /^(newsletter|stay in touch|connect)$/i, matter_type: "back_newsletter", title: "Stay in Touch" },
];

function matchHeading(
  line: string,
  list: { re: RegExp; matter_type: string; title: string }[]
): { matter_type: string; title: string } | null {
  const t = line.trim();
  for (const h of list) {
    if (h.re.test(t)) return { matter_type: h.matter_type, title: h.title };
  }
  return null;
}

function splitByHeadings(
  text: string,
  list: { re: RegExp; matter_type: string; title: string }[]
): ParsedMatter[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ParsedMatter[] = [];
  let current: ParsedMatter | null = null;
  const body: string[] = [];

  const flush = () => {
    if (!current) return;
    current.content = body.join("\n").trim();
    // Contents TOC lists are generated on export — keep enabled even if empty
    if (current.matter_type === "front_toc" || current.content) {
      blocks.push({ ...current, enabled: true });
    }
    body.length = 0;
  };

  for (const line of lines) {
    const hit = matchHeading(line, list);
    if (hit) {
      flush();
      current = { ...hit, content: "", enabled: true };
      continue;
    }
    if (current) body.push(line);
  }
  flush();
  return blocks;
}

export function parseNovelist2DocxText(raw: string): ParsedDocxProject {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const parts = text.split(CHAPTER_SPLIT);

  let title = "Untitled Novel";
  const preamble = parts[0] || "";
  const preambleLines = preamble
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of preambleLines) {
    if (matchHeading(line, FRONT_HEADINGS)) break;
    title = line;
    break;
  }

  // Front matter = preamble minus the book title line
  let frontText = preamble;
  const titleIdx = preamble.search(new RegExp(`^${escapeReg(title)}\\s*$`, "im"));
  if (titleIdx >= 0) {
    frontText = preamble.slice(titleIdx + title.length).trim();
  }
  const frontMatter = splitByHeadings(frontText, FRONT_HEADINGS);

  // If "Contents" appears but wasn't captured as a heading block, enable TOC
  if (
    /\bcontents\b/i.test(preamble) &&
    !frontMatter.some((m) => m.matter_type === "front_toc")
  ) {
    frontMatter.push({
      matter_type: "front_toc",
      title: "Contents",
      content: "",
      enabled: true,
    });
  }

  const chapterParts = parts.slice(1);
  if (!chapterParts.length && preamble) {
    const afterContents = preamble.split(/\nContents\n/i);
    const body = (afterContents[1] || preamble).trim();
    if (body && body !== title) {
      return {
        title,
        chapters: [{ title: "Chapter 1", body, number: 1 }],
        frontMatter,
        backMatter: [],
      };
    }
  }

  const chapters = chapterParts.map((part, i) => {
    const lines = part.trim().split("\n");
    const head = lines[0]?.trim() || "";
    const m = head.match(CHAPTER_HEAD);
    const number = m ? Number(m[1]) : i + 1;
    const chapterTitle = (m?.[2] || "").trim() || `Chapter ${number}`;
    let body = lines.slice(1).join("\n").trim();

    // Last chapter may include back matter after the body — strip known back headings
    if (i === chapterParts.length - 1) {
      const backSplit = body.split(/\n(?=About the Author|Also by|Sample Chapter|Newsletter|Stay in Touch)/i);
      if (backSplit.length > 1) {
        body = backSplit[0].trim();
      }
    }

    const fullTitle =
      m && m[2]?.trim()
        ? `Chapter ${number}: ${m[2].trim()}`
        : `Chapter ${number}: ${chapterTitle}`;
    return { title: fullTitle, body, number };
  });

  // Back matter: text after last chapter heading block that matches back headings
  let backMatter: ParsedMatter[] = [];
  if (chapterParts.length) {
    const lastPart = chapterParts[chapterParts.length - 1];
    const lines = lastPart.trim().split("\n").slice(1);
    const bodyFull = lines.join("\n");
    const backIdx = bodyFull.search(
      /\n(?=About the Author|Also by(?: the Author)?|Sample Chapter|Newsletter|Stay in Touch)\s*$/im
    );
    // Also try mid-body split
    const mid = bodyFull.split(
      /\n(?=About the Author|Also by(?: the Author)?|Sample Chapter|Newsletter|Stay in Touch)/i
    );
    if (mid.length > 1) {
      const backText = mid.slice(1).join("\n");
      // Re-prefix first heading line lost by split — recover from original
      const headingMatch = bodyFull.match(
        /\n(About the Author|Also by(?: the Author)?|Sample Chapter|Newsletter|Stay in Touch)[\s\S]*$/i
      );
      backMatter = splitByHeadings(headingMatch ? headingMatch[0] : backText, BACK_HEADINGS);
      void backIdx;
    }
  }

  return {
    title,
    chapters: chapters.filter((c) => c.body || c.title),
    frontMatter,
    backMatter,
  };
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Update “Chapter N” / “Chapter N: subtitle” to match a new 1-based position.
 * Custom titles without a Chapter number are left unchanged.
 */
export function applyChapterNumber(title: string, number: number): string {
  const t = (title || "").trim();
  if (!t) return `Chapter ${number}`;
  const withRest = t.match(/^Chapter\s+\d+\s*[:.\-–—]\s*(.*)$/i);
  if (withRest) {
    const rest = (withRest[1] || "").trim();
    return rest ? `Chapter ${number}: ${rest}` : `Chapter ${number}`;
  }
  if (/^Chapter\s+\d+\s*$/i.test(t)) {
    return `Chapter ${number}`;
  }
  return title;
}

export function novelist2ChapterHeading(sortOrder: number, title: string): string {
  const n = sortOrder + 1;
  const t = (title || "").trim();
  const withRest = t.match(/^Chapter\s+\d+\s*[:.\-–—]\s*(.*)$/i);
  if (withRest) {
    const rest = (withRest[1] || "").trim();
    return rest ? `Chapter ${n}: ${rest}` : `Chapter ${n}`;
  }
  if (/^Chapter\s+\d+\s*$/i.test(t)) {
    return `Chapter ${n}`;
  }
  return `Chapter ${n}: ${t || `Chapter ${n}`}`;
}

export function plainToMatterHtml(text: string): string {
  if (!text.trim()) return "<p></p>";
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

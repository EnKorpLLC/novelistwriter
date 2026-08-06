import "server-only";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
} from "docx";
import epub from "epub-gen-memory";
import type { Chapter } from "@/lib/types";
import { novelist2ChapterHeading } from "@/lib/novelist2-docx";

export type MatterBlock = {
  matter_type: string;
  title: string;
  content_html: string;
  enabled: boolean;
  sort_order: number;
};

export type CoverImage = {
  data: Uint8Array;
  type: "jpg" | "png" | "webp" | "gif";
};

function htmlToPlain(html: string): string {
  return html
    .replace(/<hr\s*\/?>/gi, "\n\n⁂\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Inline HTML → DOCX runs, preserving italic / bold / underline from TipTap. */
function runsFromInlineHtml(html: string): TextRun[] {
  const stack: string[] = [];
  const runs: TextRun[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) {
      const tag = m[1].toLowerCase();
      if (tag === "br") {
        runs.push(new TextRun({ break: 1, font: "Garamond", size: 24 }));
        continue;
      }
      if (!["em", "i", "strong", "b", "u"].includes(tag)) continue;
      if (m[0].startsWith("</")) {
        const idx = stack.lastIndexOf(tag);
        if (idx >= 0) stack.splice(idx, 1);
      } else {
        stack.push(tag);
      }
      continue;
    }
    const text = decodeEntities(m[2] || "");
    if (!text) continue;
    const italic = stack.some((t) => t === "em" || t === "i");
    const bold = stack.some((t) => t === "strong" || t === "b");
    const underline = stack.some((t) => t === "u");
    runs.push(
      new TextRun({
        text,
        font: "Garamond",
        size: 24,
        italics: italic || undefined,
        bold: bold || undefined,
        underline: underline ? {} : undefined,
      })
    );
  }
  if (!runs.length) {
    runs.push(new TextRun({ text: "", font: "Garamond", size: 24 }));
  }
  return runs;
}

function parasFromHtml(html: string): Paragraph[] {
  if (!html?.trim()) {
    return [new Paragraph({ children: [new TextRun({ text: "", font: "Garamond", size: 24 })] })];
  }

  const normalized = html
    .replace(/<hr\s*\/?>/gi, "<p style=\"text-align: center\">⁂</p>")
    .replace(/<\/div>/gi, "")
    .replace(/<div[^>]*>/gi, "");

  type Block = { inner: string; center: boolean };
  const blocks: Block[] = [];
  const pRe = /<p([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = pRe.exec(normalized)) !== null) {
    const attrs = match[1] || "";
    blocks.push({
      inner: match[2],
      center: /text-align\s*:\s*center/i.test(attrs),
    });
  }

  if (!blocks.length) {
    const stripped = normalized.replace(/<\/?(?:body|html|head)[^>]*>/gi, "").trim();
    if (stripped) blocks.push({ inner: stripped, center: false });
  }

  if (!blocks.length) {
    return [new Paragraph({ children: [new TextRun({ text: "", font: "Garamond", size: 24 })] })];
  }

  return blocks.map(
    (b) =>
      new Paragraph({
        spacing: { after: 200 },
        alignment: b.center ? AlignmentType.CENTER : undefined,
        children: runsFromInlineHtml(b.inner),
      })
  );
}

function parasFromText(text: string): Paragraph[] {
  const chunks = text.split(/\n+/).filter(Boolean);
  if (!chunks.length) return [new Paragraph({ children: [new TextRun("")] })];
  return chunks.map(
    (line) =>
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: line, font: "Garamond", size: 24 })],
      })
  );
}

function chapterBodyParas(ch: Chapter): Paragraph[] {
  if (ch.content_html?.trim()) return parasFromHtml(ch.content_html);
  return parasFromText(ch.content_text || "");
}

function matterBodyParas(html: string): Paragraph[] {
  if (html?.trim() && /<[a-z][\s\S]*>/i.test(html)) return parasFromHtml(html);
  return parasFromText(htmlToPlain(html));
}

function docxImageType(type: CoverImage["type"]): "jpg" | "png" | "gif" | null {
  if (type === "jpg" || type === "png" || type === "gif") return type;
  return null;
}

/** Novelist 2.0–style DOCX: optional cover → title → Contents → Chapter N: Title → body → matter */
export async function exportDocx(opts: {
  title: string;
  subtitle?: string;
  authorName?: string;
  chapters: Chapter[];
  matter: MatterBlock[];
  cover?: CoverImage | null;
}): Promise<Blob> {
  const front = opts.matter
    .filter((m) => m.enabled && m.matter_type.startsWith("front_") && m.matter_type !== "front_toc")
    .sort((a, b) => a.sort_order - b.sort_order);
  const back = opts.matter
    .filter((m) => m.enabled && m.matter_type.startsWith("back_"))
    .sort((a, b) => a.sort_order - b.sort_order);
  const ordered = [...opts.chapters].sort((a, b) => a.sort_order - b.sort_order);
  const includeToc = opts.matter.some((m) => m.enabled && m.matter_type === "front_toc");

  const children: Paragraph[] = [];

  const docxType = opts.cover ? docxImageType(opts.cover.type) : null;
  if (opts.cover && docxType) {
    children.push(
      new Paragraph({
        spacing: { after: 400 },
        children: [
          new ImageRun({
            type: docxType,
            data: opts.cover.data,
            transformation: { width: 400, height: 600 },
            altText: { title: "Cover", description: "Book cover", name: "cover" },
          }),
        ],
      })
    );
  }

  children.push(
    new Paragraph({
      spacing: { after: 400 },
      children: [new TextRun({ text: opts.title, bold: true, font: "Garamond", size: 56 })],
    })
  );

  if (opts.authorName) {
    children.push(
      new Paragraph({
        spacing: { after: 600 },
        children: [new TextRun({ text: opts.authorName, font: "Garamond", size: 24 })],
      })
    );
  }

  for (const block of front) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({ text: block.title || block.matter_type, font: "Garamond", bold: true }),
        ],
      })
    );
    children.push(...matterBodyParas(block.content_html));
  }

  if (includeToc) {
    children.push(
      new Paragraph({
        spacing: { before: 400, after: 200 },
        children: [new TextRun({ text: "Contents", bold: true, font: "Garamond", size: 32 })],
      })
    );
    for (const ch of ordered) {
      const heading = novelist2ChapterHeading(ch.sort_order, ch.title);
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: heading, font: "Garamond", size: 22 })],
        })
      );
    }
  }

  for (const ch of ordered) {
    const heading = novelist2ChapterHeading(ch.sort_order, ch.title);
    children.push(
      new Paragraph({
        spacing: { before: 400, after: 200 },
        children: [new TextRun({ text: heading, bold: true, font: "Garamond", size: 32 })],
      })
    );
    children.push(...chapterBodyParas(ch));
  }

  for (const block of back) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({ text: block.title || block.matter_type, font: "Garamond", bold: true }),
        ],
      })
    );
    children.push(...matterBodyParas(block.content_html));
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const buffer = await Packer.toBuffer(doc);
  const bytes = new Uint8Array(buffer);
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function epubCoverMeta(type: CoverImage["type"]): { ext: string; media: string } {
  if (type === "png") return { ext: "png", media: "image/png" };
  if (type === "webp") return { ext: "webp", media: "image/webp" };
  if (type === "gif") return { ext: "gif", media: "image/gif" };
  return { ext: "jpg", media: "image/jpeg" };
}

/** TipTap HTML → clean fragment safe for EPUB generators. */
function htmlForEpub(html: string | null | undefined): string {
  let s = (html || "").trim();
  if (!s) return "<p></p>";
  s = s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\scontenteditable="[^"]*"/gi, "")
    .replace(/\sdata-[a-z0-9-]+="[^"]*"/gi, "")
    .replace(/\sspellcheck="[^"]*"/gi, "")
    // Void elements must be self-closing for XHTML serializers
    .replace(/<(br|hr|img|meta|link|input|source|area|col|embed|wbr)(\s[^>/]*?)?\s*>/gi, "<$1$2 />")
    // Unescaped ampersands in text (leave existing entities alone)
    .replace(/&(?!(?:#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);)/g, "&amp;");
  return s || "<p></p>";
}

function plainTextToEpubHtml(text: string): string {
  const parts = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "<p></p>";
  return parts
    .map((p) => `<p>${escapeXml(p).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * EPUB 2 package via epub-gen-memory.
 * Consumer Google Play Books often hangs forever on minimal/invalid EPUB 3 files;
 * EPUB 2 with cleaned HTML uploads reliably (also accepted by KDP).
 */
export async function exportEpub(opts: {
  title: string;
  authorName?: string;
  chapters: Chapter[];
  matter: MatterBlock[];
  cover?: CoverImage | null;
}): Promise<Blob> {
  const orderedChapters = [...opts.chapters].sort((a, b) => a.sort_order - b.sort_order);
  const front = opts.matter
    .filter((m) => m.enabled && m.matter_type.startsWith("front_"))
    .sort((a, b) => a.sort_order - b.sort_order);
  const back = opts.matter
    .filter((m) => m.enabled && m.matter_type.startsWith("back_"))
    .sort((a, b) => a.sort_order - b.sort_order);

  type EpubChapter = {
    title: string;
    content: string;
    beforeToc?: boolean;
    excludeFromToc?: boolean;
  };

  const content: EpubChapter[] = [];

  for (const block of front) {
    // Skip empty TOC placeholder pages — epub-gen builds its own TOC
    if (block.matter_type === "front_toc") continue;
    content.push({
      title: block.title || "Front matter",
      content: htmlForEpub(block.content_html),
      beforeToc: true,
    });
  }

  for (const ch of orderedChapters) {
    const body = ch.content_html?.trim()
      ? htmlForEpub(ch.content_html)
      : plainTextToEpubHtml(ch.content_text || "");
    content.push({
      title: ch.title || "Untitled",
      content: body,
    });
  }

  for (const block of back) {
    content.push({
      title: block.title || "Back matter",
      content: htmlForEpub(block.content_html),
    });
  }

  if (!content.length) {
    content.push({ title: "Manuscript", content: "<p></p>" });
  }

  // Play Books / many readers only reliably accept JPEG/PNG covers
  let cover: File | undefined;
  if (opts.cover && (opts.cover.type === "jpg" || opts.cover.type === "png")) {
    const { ext, media } = epubCoverMeta(opts.cover.type);
    const bytes = Buffer.from(opts.cover.data);
    cover = new File([bytes], `cover.${ext}`, { type: media });
  }

  const buffer = await epub(
    {
      title: opts.title || "Untitled",
      author: opts.authorName || "Author",
      publisher: "Novelist Writer",
      lang: "en",
      version: 2,
      cover,
      tocTitle: "Contents",
      tocInTOC: false,
      numberChaptersInTOC: false,
      prependChapterTitles: true,
      ignoreFailedDownloads: true,
      css: `
body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; margin: 1em; }
h1 { font-size: 1.35em; margin: 0 0 1em; page-break-after: avoid; text-align: center; }
p { margin: 0 0 0.85em; text-indent: 1.25em; }
p:first-of-type { text-indent: 0; }
blockquote { margin: 1em 1.5em; font-style: italic; }
`,
    },
    content
  );

  return new Blob([Buffer.from(buffer)], { type: "application/epub+zip" });
}

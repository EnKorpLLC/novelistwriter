import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
} from "docx";
import JSZip from "jszip";
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

/** Minimal EPUB 3 package suitable for KDP upload */
export async function exportEpub(opts: {
  title: string;
  authorName?: string;
  chapters: Chapter[];
  matter: MatterBlock[];
  cover?: CoverImage | null;
}): Promise<Blob> {
  const zip = new JSZip();
  const orderedChapters = [...opts.chapters].sort((a, b) => a.sort_order - b.sort_order);
  const front = opts.matter
    .filter((m) => m.enabled && m.matter_type.startsWith("front_"))
    .sort((a, b) => a.sort_order - b.sort_order);
  const back = opts.matter
    .filter((m) => m.enabled && m.matter_type.startsWith("back_"))
    .sort((a, b) => a.sort_order - b.sort_order);

  type SpineItem = { id: string; href: string; title: string; html: string };
  const items: SpineItem[] = [];

  let i = 0;
  for (const block of front) {
    i += 1;
    const id = `front${i}`;
    items.push({
      id,
      href: `${id}.xhtml`,
      title: block.title || "Front matter",
      html: wrapXhtml(
        block.title || "Front matter",
        block.content_html || `<p>${htmlToPlain(block.content_html)}</p>`
      ),
    });
  }
  orderedChapters.forEach((ch, idx) => {
    const id = `chap${idx + 1}`;
    const body =
      ch.content_html ||
      ch.content_text
        .split(/\n\n+/)
        .map((p) => `<p>${escapeXml(p)}</p>`)
        .join("\n");
    items.push({
      id,
      href: `${id}.xhtml`,
      title: ch.title,
      html: wrapXhtml(ch.title, body),
    });
  });
  for (const block of back) {
    i += 1;
    const id = `back${i}`;
    items.push({
      id,
      href: `${id}.xhtml`,
      title: block.title || "Back matter",
      html: wrapXhtml(
        block.title || "Back matter",
        block.content_html || `<p>${htmlToPlain(block.content_html)}</p>`
      ),
    });
  }

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")?.file(
    "container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  );

  const oebps = zip.folder("OEBPS");
  items.forEach((item) => oebps?.file(item.href, item.html));

  let coverManifest = "";
  let coverMeta = "";
  let coverHref = "";
  if (opts.cover) {
    const { ext, media } = epubCoverMeta(opts.cover.type);
    coverHref = `cover.${ext}`;
    oebps?.file(coverHref, opts.cover.data);
    coverManifest = `<item id="cover-image" href="${coverHref}" media-type="${media}" properties="cover-image"/>`;
    coverMeta = `<meta name="cover" content="cover-image"/>`;
    oebps?.file(
      "cover.xhtml",
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Cover</title></head>
<body style="text-align:center;margin:0;padding:0;">
<img src="${coverHref}" alt="Cover" style="max-width:100%;height:auto;"/>
</body></html>`
    );
  }

  const manifest = items
    .map((item) => `<item id="${item.id}" href="${item.href}" media-type="application/xhtml+xml"/>`)
    .join("\n");
  const spine = items.map((item) => `<itemref idref="${item.id}"/>`).join("\n");
  const navLis = items
    .map((item) => `<li><a href="${item.href}">${escapeXml(item.title)}</a></li>`)
    .join("\n");

  oebps?.file(
    "content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${cryptoRandom()}</dc:identifier>
    <dc:title>${escapeXml(opts.title)}</dc:title>
    <dc:creator>${escapeXml(opts.authorName || "Author")}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
    ${coverMeta}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${opts.cover ? `<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>` : ""}
    ${coverManifest}
    ${manifest}
  </manifest>
  <spine>
    ${opts.cover ? `<itemref idref="cover"/>` : ""}
    <itemref idref="nav"/>
    ${spine}
  </spine>
</package>`
  );

  oebps?.file(
    "nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body>
<nav epub:type="toc"><ol>${navLis}</ol></nav>
</body></html>`
  );

  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

function wrapXhtml(title: string, body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(title)}</title></head>
<body>
<h1>${escapeXml(title)}</h1>
${body}
</body></html>`;
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cryptoRandom() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const KDP_CHECKLIST = [
  { id: "trim", label: "Trim size set (e.g. 6×9)", field: "trim" },
  { id: "margins", label: "Margins appropriate for page count", field: "margins" },
  { id: "font", label: "Body font chosen (Garamond / Times / etc.)", field: "font" },
  { id: "copyright", label: "Copyright page in front matter", matter: "front_copyright" },
  { id: "toc", label: "Table of contents enabled", matter: "front_toc" },
  { id: "blurb", label: "Book description drafted (critique available)", meta: "blurb" },
  { id: "categories", label: "BISAC categories noted in metadata", meta: "categories" },
  { id: "keywords", label: "Seven backend keywords noted", meta: "keywords" },
  { id: "epub", label: "EPUB exported and validated", action: "epub" },
] as const;

export function validateEpubStructure(chapters: Chapter[]): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!chapters.length) issues.push("No chapters to export.");
  chapters.forEach((ch, i) => {
    if (!ch.title?.trim()) issues.push(`Chapter ${i + 1} is missing a title.`);
    if ((ch.word_count || 0) < 1 && !ch.content_text?.trim()) {
      issues.push(`Chapter "${ch.title || i + 1}" appears empty.`);
    }
  });
  return { ok: issues.length === 0, issues };
}

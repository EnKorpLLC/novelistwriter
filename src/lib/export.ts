import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import JSZip from "jszip";
import type { Chapter } from "@/lib/types";

export type MatterBlock = {
  matter_type: string;
  title: string;
  content_html: string;
  enabled: boolean;
  sort_order: number;
};

function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
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

export async function exportDocx(opts: {
  title: string;
  subtitle?: string;
  authorName?: string;
  chapters: Chapter[];
  matter: MatterBlock[];
}): Promise<Blob> {
  const front = opts.matter
    .filter((m) => m.enabled && m.matter_type.startsWith("front_"))
    .sort((a, b) => a.sort_order - b.sort_order);
  const back = opts.matter
    .filter((m) => m.enabled && m.matter_type.startsWith("back_"))
    .sort((a, b) => a.sort_order - b.sort_order);

  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: opts.title, bold: true, font: "Garamond", size: 48 })],
    }),
  ];

  if (opts.subtitle) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: opts.subtitle, italics: true, font: "Garamond", size: 28 })],
      })
    );
  }
  if (opts.authorName) {
    children.push(
      new Paragraph({
        spacing: { after: 400 },
        children: [new TextRun({ text: opts.authorName, font: "Garamond", size: 24 })],
      })
    );
  }

  for (const block of front) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: block.title || block.matter_type, font: "Garamond" })],
      })
    );
    children.push(...parasFromText(htmlToPlain(block.content_html)));
  }

  for (const ch of [...opts.chapters].sort((a, b) => a.sort_order - b.sort_order)) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: ch.title, font: "Garamond", bold: true })],
      })
    );
    children.push(...parasFromText(ch.content_text || htmlToPlain(ch.content_html)));
  }

  for (const block of back) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: block.title || block.matter_type, font: "Garamond" })],
      })
    );
    children.push(...parasFromText(htmlToPlain(block.content_html)));
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

/** Minimal EPUB 3 package suitable for KDP upload */
export async function exportEpub(opts: {
  title: string;
  authorName?: string;
  chapters: Chapter[];
  matter: MatterBlock[];
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
      html: wrapXhtml(block.title || "Front matter", block.content_html || `<p>${htmlToPlain(block.content_html)}</p>`),
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
      html: wrapXhtml(block.title || "Back matter", block.content_html || `<p>${htmlToPlain(block.content_html)}</p>`),
    });
  }

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")?.file(
    "container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  );

  const oebps = zip.folder("OEBPS");
  items.forEach((item) => oebps?.file(item.href, item.html));

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
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifest}
  </manifest>
  <spine>
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

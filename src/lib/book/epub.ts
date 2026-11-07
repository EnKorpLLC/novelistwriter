import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { appUrl } from "@/lib/stripe";
import { escapeXml, type Book } from "@/lib/book/model";
import { renderChapter, renderSection } from "@/lib/book/render";
import { bookCss, FONTS, type BookStyle } from "@/lib/book/styles";

export type EpubCover = { data: Uint8Array; type: "jpg" | "png" | "webp" | "gif" };

const MEDIA: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

/** Bundled fonts live in public/; read from disk locally, or from the site itself when deployed. */
async function loadFont(publicPath: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), "public", publicPath)));
  } catch {
    try {
      const res = await fetch(appUrl(publicPath), { signal: AbortSignal.timeout(10000) });
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }
}

function xhtml(title: string, body: string, lang: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="../styles/book.css"/>
</head>
<body>
${body}
</body>
</html>`;
}

/** A styled EPUB 3 (with an EPUB 2 table of contents for older readers). */
export async function buildStyledEpub(opts: {
  book: Book;
  style: BookStyle;
  identifier: string;
  cover: EpubCover | null;
  recordUrl?: string | null;
  language?: string;
}): Promise<Buffer> {
  const { book, style } = opts;
  const lang = opts.language || "en";
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );

  // Heading font only: readers use their own body font, and embedded body fonts add Kindle delivery fees
  const heading = FONTS[style.heading];
  const fontFiles: { href: string; data: Uint8Array }[] = [];
  const regular = await loadFont(heading.regular);
  if (regular) fontFiles.push({ href: "fonts/heading.ttf", data: regular });
  const italic = heading.italic ? await loadFont(heading.italic) : null;
  if (italic) fontFiles.push({ href: "fonts/heading-italic.ttf", data: italic });
  const css = bookCss(style, "epub", (p) =>
    p === heading.italic ? "../fonts/heading-italic.ttf" : "../fonts/heading.ttf"
  );
  zip.file("OEBPS/styles/book.css", fontFiles.length ? css : css.replace(/@font-face[^}]*}/g, ""));
  for (const f of fontFiles) zip.file(`OEBPS/${f.href}`, f.data);

  type Item = { id: string; href: string; title: string; body: string; linear?: boolean; tocLabel?: string; type?: string };
  const items: Item[] = [];

  let coverHref: string | null = null;
  if (opts.cover && MEDIA[opts.cover.type]) {
    coverHref = `images/cover.${opts.cover.type}`;
    zip.file(`OEBPS/${coverHref}`, opts.cover.data);
    items.push({
      id: "cover",
      href: "text/cover.xhtml",
      title: "Cover",
      type: "cover",
      body: `<section epub:type="cover" style="text-align:center;margin:0;padding:0"><img src="../${coverHref}" alt="${escapeXml(book.title)}" style="max-width:100%;max-height:100%"/></section>`,
    });
  }

  const chapterHref = (i: number) => `ch${String(i + 1).padStart(3, "0")}.xhtml`;
  const tocLinks = book.chapters.map((c, i) => ({ label: c.tocLabel, href: chapterHref(i) }));

  book.front.forEach((s, i) => {
    items.push({
      id: `front${i + 1}`,
      href: `text/front${i + 1}.xhtml`,
      title: s.title,
      type: s.special === "toc" ? "toc" : s.special === "title" ? "titlepage" : undefined,
      body: renderSection(s, book, style, { tocLinks, recordUrl: opts.recordUrl }),
    });
  });
  book.chapters.forEach((c, i) => {
    items.push({
      id: `ch${i + 1}`,
      href: `text/${chapterHref(i)}`,
      title: c.tocLabel,
      tocLabel: c.tocLabel,
      type: i === 0 ? "bodymatter" : undefined,
      body: renderChapter(c, book, style),
    });
  });
  book.back.forEach((s, i) => {
    items.push({
      id: `back${i + 1}`,
      href: `text/back${i + 1}.xhtml`,
      title: s.title,
      tocLabel: s.title,
      body: renderSection(s, book, style, { recordUrl: opts.recordUrl }),
    });
  });

  for (const it of items) zip.file(`OEBPS/${it.href}`, xhtml(it.title, it.body, lang));

  // Navigation: chapters plus back matter; front matter is reached through the landmarks
  const navEntries = items.filter((it) => it.tocLabel);
  const firstChapter = items.find((it) => it.type === "bodymatter");
  const tocPage = items.find((it) => it.type === "toc");
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${navEntries.map((it) => `<li><a href="${it.href}">${escapeXml(it.tocLabel!)}</a></li>`).join("\n")}
</ol></nav>
<nav epub:type="landmarks" hidden="hidden"><ol>
${coverHref ? `<li><a epub:type="cover" href="text/cover.xhtml">Cover</a></li>` : ""}
${tocPage ? `<li><a epub:type="toc" href="${tocPage.href}">Contents</a></li>` : ""}
${firstChapter ? `<li><a epub:type="bodymatter" href="${firstChapter.href}">Start reading</a></li>` : ""}
</ol></nav>
</body>
</html>`
  );
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${escapeXml(opts.identifier)}"/><meta name="dtb:depth" content="1"/></head>
<docTitle><text>${escapeXml(book.title)}</text></docTitle>
<navMap>
${navEntries
  .map(
    (it, i) =>
      `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(it.tocLabel!)}</text></navLabel><content src="${it.href}"/></navPoint>`
  )
  .join("\n")}
</navMap>
</ncx>`
  );

  const d = book.details;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const seriesMeta = d.seriesName
    ? `<meta property="belongs-to-collection" id="series">${escapeXml(d.seriesName)}</meta>
<meta refines="#series" property="collection-type">series</meta>
${d.seriesNumber ? `<meta refines="#series" property="group-position">${escapeXml(d.seriesNumber)}</meta>` : ""}
<meta name="calibre:series" content="${escapeXml(d.seriesName)}"/>
${d.seriesNumber ? `<meta name="calibre:series_index" content="${escapeXml(d.seriesNumber)}"/>` : ""}`
    : "";
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${escapeXml(d.isbnEbook ? `urn:isbn:${d.isbnEbook.replace(/-/g, "")}` : opts.identifier)}</dc:identifier>
<dc:title id="title">${escapeXml(book.title)}</dc:title>
${book.subtitle ? `<dc:title id="subtitle">${escapeXml(book.subtitle)}</dc:title><meta refines="#subtitle" property="title-type">subtitle</meta>` : ""}
<dc:creator id="creator">${escapeXml(book.author)}</dc:creator>
<dc:language>${lang}</dc:language>
<dc:publisher>${escapeXml(d.imprint || book.author)}</dc:publisher>
<dc:rights>Copyright ${escapeXml(d.copyrightYear || String(new Date().getFullYear()))} ${escapeXml(d.copyrightHolder || book.author)}. All rights reserved.</dc:rights>
<meta property="dcterms:modified">${modified}</meta>
${coverHref ? `<meta name="cover" content="cover-image"/>` : ""}
${seriesMeta}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="styles/book.css" media-type="text/css"/>
${fontFiles.map((f, i) => `<item id="font${i + 1}" href="${f.href}" media-type="font/ttf"/>`).join("\n")}
${coverHref ? `<item id="cover-image" href="${coverHref}" media-type="${MEDIA[opts.cover!.type]}" properties="cover-image"/>` : ""}
${items.map((it) => `<item id="${it.id}" href="${it.href}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine toc="ncx">
${items.map((it) => `<itemref idref="${it.id}"${it.linear === false ? ' linear="no"' : ""}/>`).join("\n")}
</spine>
</package>`
  );

  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip", compression: "DEFLATE" });
}

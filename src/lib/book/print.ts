/** Paperback interior: print CSS and the page document laid out by Paged.js in the browser. Client-safe. */
import { PRINT_SIZES, type Paper, type TrimSize } from "@/lib/book/format";
import { escapeXml, type Book } from "@/lib/book/model";
import { renderChapter, renderSection } from "@/lib/book/render";
import { bookCss, type BookStyle } from "@/lib/book/styles";

export const TRIM_INCHES: Record<TrimSize, { w: number; h: number }> = {
  "5x8": { w: 5, h: 8 },
  "5.06x7.81": { w: 5.06, h: 7.81 },
  "5.25x8": { w: 5.25, h: 8 },
  "5.5x8.5": { w: 5.5, h: 8.5 },
  "6x9": { w: 6, h: 9 },
};

export const KDP_MIN_PAGES = 24;
/** KDP paperback limits for black ink interiors */
export const KDP_MAX_PAGES: Record<Paper, number> = { white: 828, cream: 776 };

/** KDP's minimum inside (gutter) margin for a page count, without bleed. */
export function kdpGutter(pages: number): number {
  if (pages <= 150) return 0.375;
  if (pages <= 300) return 0.5;
  if (pages <= 500) return 0.625;
  if (pages <= 700) return 0.75;
  return 0.875;
}

export type PrintMargins = { top: number; bottom: number; inside: number; outside: number; kdpMinimum: number };

export function printMargins(trim: TrimSize, pages: number): PrintMargins {
  const { w } = TRIM_INCHES[trim];
  const kdpMinimum = kdpGutter(pages);
  return {
    top: 0.7,
    bottom: 0.75,
    outside: w <= 5.25 ? 0.5 : 0.6,
    // A little more than KDP's minimum keeps words out of the fold
    inside: Math.round((kdpMinimum + 0.15) * 1000) / 1000,
    kdpMinimum,
  };
}

/** Rough page count before the first layout, so the first pass picks a sensible gutter. */
export function estimatePages(book: Book, words: number): number {
  const { w, h } = TRIM_INCHES[book.format.trim];
  const pt = PRINT_SIZES.find((p) => p.id === book.format.printSize)?.pt ?? 11;
  const perPage = 300 * (((w - 1.15) * (h - 1.45)) / (4.85 * 7.55)) * (11 / pt) ** 2;
  return Math.max(KDP_MIN_PAGES, Math.round(words / perPage + book.front.length + book.back.length + book.chapters.length * 0.6));
}

const cssString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;

function printCss(book: Book, style: BookStyle, m: PrintMargins): string {
  const { w, h } = TRIM_INCHES[book.format.trim];
  const pt = PRINT_SIZES.find((p) => p.id === book.format.printSize)?.pt ?? 11;
  const leading = pt >= 16 ? 1.3 : 1.38;
  const heads = book.format.runningHeads;
  const none = "@top-left { content: none; } @top-center { content: none; } @top-right { content: none; } @bottom-center { content: none; }";
  const box = `font-family: "NW Body", Georgia, serif; font-size: ${Math.max(7.5, pt * 0.78)}pt; letter-spacing: 0.06em; color: #333;`;
  const headBox = `${box} vertical-align: bottom; padding-bottom: 0.18in;`;
  const footBox = `${box} vertical-align: top; padding-top: 0.2in;`;
  const chapterBreak = book.format.chapterStartRight ? "right" : "page";

  return `
@page { size: ${w}in ${h}in; margin: ${m.top}in ${m.outside}in ${m.bottom}in ${m.inside}in; }
@page :left { margin-left: ${m.outside}in; margin-right: ${m.inside}in; }
@page :right { margin-left: ${m.inside}in; margin-right: ${m.outside}in; }

@page chapter:left {
  ${heads ? `@top-left { content: counter(page); ${headBox} text-align: left; } @top-center { content: ${cssString(book.author)}; ${headBox} font-variant: small-caps; }` : `@bottom-center { content: counter(page); ${footBox} }`}
}
@page chapter:right {
  ${heads ? `@top-right { content: counter(page); ${headBox} text-align: right; } @top-center { content: ${cssString(book.title)}; ${headBox} font-variant: small-caps; }` : `@bottom-center { content: counter(page); ${footBox} }`}
}
@page chapter:first { ${none} @bottom-center { content: counter(page); ${footBox} } }
@page back { @bottom-center { content: counter(page); ${footBox} } }
@page front { ${none} }
@page part { ${none} }
@page :blank { ${none} }

html { font-size: ${pt}pt; }
body { font-size: ${pt}pt; line-height: ${leading}; margin: 0; padding: 0; color: #000; }
p { text-align: justify; hyphens: auto; -webkit-hyphens: auto; orphans: 2; widows: 2; }
p.center, p.right, p.scene-break { hyphens: manual; }
a { color: inherit; text-decoration: none; }
h1, h2, h3, h4, .chapter-head, .chapter-label { break-after: avoid; break-inside: avoid; }
p.scene-break { break-after: avoid; }
.dropcap { font-size: 3.55em; line-height: 0.8; margin: 0.05em 0.07em 0 0; }

.print-front { page: front; break-before: right; }
.print-front.print-verso { break-before: left; }
.print-part { page: part; break-before: right; }
.print-chapter { page: chapter; break-before: ${chapterBreak}; }
.print-part + .print-chapter { break-before: right; }
.print-body-start { counter-reset: page 1; break-before: right; }
.print-back { page: back; break-before: page; }

.chapter-head { margin: ${Math.round(h * 0.16 * 100) / 100}in 0 2.2em; }
.part-page { margin-top: ${Math.round(h * 0.3 * 100) / 100}in; }
.title-page { margin-top: ${Math.round(h * 0.22 * 100) / 100}in; }
.title-page .book-imprint { margin-top: ${Math.round(h * 0.3 * 100) / 100}in; }
.dedication, .epigraph { margin-top: ${Math.round(h * 0.25 * 100) / 100}in; }
.copyright { position: relative; }
.copyright p { font-size: 0.82em; text-align: left; hyphens: manual; }
.toc ol { margin-top: 0.5em; }
.toc li { margin: 0.35em 0; }
.toc a { display: flex; gap: 1em; }
.toc a::after { content: target-counter(attr(href url), page); margin-left: auto; }
`;
}

/** Shown on screen only; Paged.js leaves media="screen" styles alone, so they never reach the PDF. */
const SCREEN_CSS = `
html, body { background: #d9d6d0 !important; }
.pagedjs_pages { display: flex; flex-wrap: wrap; width: calc(var(--pagedjs-width) * 2); margin: 0 auto; padding: 16px 0; zoom: var(--nw-zoom, 1); }
.pagedjs_page { background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,0.25); margin-bottom: 18px; }
.pagedjs_first_page { margin-left: var(--pagedjs-width); }
html.nw-single .pagedjs_pages { width: var(--pagedjs-width); }
html.nw-single .pagedjs_first_page { margin-left: 0; }
html.nw-guides .pagedjs_area { outline: 1px dashed rgba(200, 40, 40, 0.55); }
`;

/**
 * A complete HTML document that lays itself out with Paged.js and reports progress to the parent page:
 * { type: "nw-print-progress" | "nw-print-done", pages } or { type: "nw-print-error", message }.
 */
export function renderPrintDocument(opts: {
  book: Book;
  style: BookStyle;
  margins: PrintMargins;
  recordUrl?: string | null;
  pagedScript?: string;
}): string {
  const { book, style, margins } = opts;
  const tocLinks = book.chapters.map((c, i) => ({ label: c.tocLabel, href: `#nw-ch-${i}` }));

  const front = book.front
    .map((s, i) => {
      const verso = s.special === "copyright" && i > 0 && book.front[i - 1].special === "title";
      return `<div class="print-front${verso ? " print-verso" : ""}">${renderSection(s, book, style, { tocLinks, recordUrl: opts.recordUrl })}</div>`;
    })
    .join("\n");

  const body = book.chapters
    .map((c, i) => {
      const cls = [c.kind === "part" ? "print-part" : "print-chapter", i === 0 ? "print-body-start" : ""].filter(Boolean).join(" ");
      return `<div class="${cls}" id="nw-ch-${i}">${renderChapter(c, book, style)}</div>`;
    })
    .join("\n");

  const back = book.back
    .map((s) => `<div class="print-back">${renderSection(s, book, style, { recordUrl: opts.recordUrl })}</div>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeXml(book.title)}</title>
<style data-nw-print>${bookCss(style, "preview")}</style>
<style data-nw-print>${printCss(book, style, margins)}</style>
<style media="screen">${SCREEN_CSS}</style>
<script>window.PagedConfig = { auto: false };</script>
<script src="${opts.pagedScript || "/vendor/pagedjs/paged.polyfill.min.js"}"></script>
<script>
var send = function (msg) { parent.postMessage(msg, "*"); };
window.addEventListener("error", function (e) { send({ type: "nw-print-error", message: e.message }); });
window.addEventListener("unhandledrejection", function (e) { send({ type: "nw-print-error", message: String((e.reason && e.reason.message) || e.reason) }); });
window.addEventListener("load", function () {
  var count = 0;
  var previewer = new Paged.Previewer();
  previewer.on("page", function () { count++; if (count % 10 === 0) send({ type: "nw-print-progress", pages: count }); });
  // A srcdoc frame's own URL is about:srcdoc, which Paged.js can't resolve font paths against, so key the sheets to the base URL
  var sheets = [].slice.call(document.querySelectorAll("style[data-nw-print]")).map(function (el) {
    var sheet = {};
    sheet[document.baseURI] = el.textContent;
    el.remove();
    return sheet;
  });
  previewer.preview(undefined, sheets).then(function (flow) {
    // Chrome scopes Paged.js's counter-reset to a single page, so restart numbering with counter-set instead
    var start = document.querySelector(".pagedjs_page .print-body-start");
    var page = start && start.closest(".pagedjs_page");
    if (page) {
      var fix = document.createElement("style");
      fix.textContent = '.pagedjs_pages > .pagedjs_page[data-page-number="' + page.getAttribute("data-page-number") + '"] { counter-reset: none; counter-increment: none; counter-set: page 1; }';
      document.head.appendChild(fix);
    }
    send({ type: "nw-print-done", pages: flow.total });
  }).catch(function (err) {
    send({ type: "nw-print-error", message: String((err && err.message) || err) });
  });
});
</script>
</head>
<body>
${front}
${body}
${back}
</body>
</html>`;
}

/** Book model to XHTML: shared by the EPUB builder and the in-app previews. Client-safe. */
import { copyrightLines, escapeXml, type Block, type Book, type BookChapter, type BookSection } from "@/lib/book/model";
import type { BookStyle } from "@/lib/book/styles";

type Opening = "dropcap" | "smallcaps" | "none";

function openingFor(book: Book, style: BookStyle): Opening {
  return book.format.firstLine === "style" ? style.firstLine : book.format.firstLine;
}

/** Wrap the first letter (with any opening quote) in a drop cap, when the paragraph starts with plain text. */
function withDropCap(html: string): string {
  const m = /^([“"‘'(]*)([A-Za-z0-9À-ÿ])/.exec(html);
  if (!m) return html;
  return `<span class="dropcap">${m[1]}${m[2]}</span>${html.slice(m[0].length)}`;
}

/** Small capitals on the first few words, when the paragraph starts with plain text. */
function withLead(html: string): string {
  const firstTag = html.indexOf("<");
  const plain = firstTag === -1 ? html : html.slice(0, firstTag);
  const m = /^(\S+(?:\s+\S+){0,3})/.exec(plain);
  if (!m || !m[1].trim()) return html;
  return `<span class="lead">${m[1]}</span>${html.slice(m[1].length)}`;
}

export function renderBlocks(blocks: Block[], opts: { opening: Opening; ornament: string; matter?: boolean }): string {
  let afterBreak = true;
  let first = true;
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "p": {
        const classes: string[] = [];
        let html = b.html;
        if (b.align !== "left") classes.push(b.align);
        if (afterBreak && b.align === "left") {
          classes.push("first");
          if (!opts.matter) {
            if (first && opts.opening === "dropcap") html = withDropCap(html);
            else if (opts.opening !== "none") html = withLead(html);
          }
        }
        out.push(`<p${classes.length ? ` class="${classes.join(" ")}"` : ""}>${html}</p>`);
        afterBreak = false;
        first = false;
        break;
      }
      case "heading":
        out.push(`<h${Math.min(4, b.level + 1)}>${b.html}</h${Math.min(4, b.level + 1)}>`);
        afterBreak = true;
        break;
      case "quote":
        out.push(`<blockquote>${renderBlocks(b.blocks, { ...opts, matter: true })}</blockquote>`);
        afterBreak = true;
        break;
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        out.push(`<${tag}>${b.items.map((i) => `<li>${i}</li>`).join("")}</${tag}>`);
        afterBreak = true;
        break;
      }
      case "break":
        out.push(`<p class="scene-break" role="separator">${escapeXml(opts.ornament)}</p>`);
        afterBreak = true;
        break;
      case "pre":
        out.push(`<pre>${escapeXml(b.text)}</pre>`);
        break;
      case "image":
        if (b.role === "break") {
          out.push(`<div class="scene-break-image" role="separator"><img src="${escapeXml(b.src)}" alt=""/></div>`);
          afterBreak = true;
        } else {
          out.push(`<figure class="illustration"><img src="${escapeXml(b.src)}" alt="${escapeXml(b.alt)}"/></figure>`);
          first = false;
        }
        break;
    }
  }
  return out.join("\n");
}

export function renderChapter(ch: BookChapter, book: Book, style: BookStyle): string {
  const ornament = book.format.sceneBreak || style.ornament;
  if (ch.kind === "part") {
    return `<section class="part-page" epub:type="part"><h1 class="chapter-title">${escapeXml(ch.name)}</h1></section>${
      ch.blocks.length ? `\n${renderBlocks(ch.blocks, { opening: "none", ornament })}` : ""
    }`;
  }
  // Every chapter gets exactly one h1, so screen readers and the table of contents find it
  const heading =
    ch.label && ch.name
      ? `<p class="chapter-label">${escapeXml(ch.label)}</p><h1 class="chapter-title">${escapeXml(ch.name)}</h1>`
      : ch.label
        ? `<h1 class="chapter-label">${escapeXml(ch.label)}</h1>`
        : `<h1 class="chapter-title">${escapeXml(ch.name || ch.tocLabel)}</h1>`;
  return `<section epub:type="chapter"><header class="chapter-head">${heading}</header>
${renderBlocks(ch.blocks, { opening: openingFor(book, style), ornament })}
</section>`;
}

export function renderSection(
  s: BookSection,
  book: Book,
  style: BookStyle,
  opts: { tocLinks?: { label: string; href: string }[]; recordUrl?: string | null } = {}
): string {
  const ornament = book.format.sceneBreak || style.ornament;
  if (s.special === "title") {
    return `<section class="title-page" epub:type="titlepage">
<p class="book-title">${escapeXml(book.title)}</p>
${book.subtitle ? `<p class="book-subtitle">${escapeXml(book.subtitle)}</p>` : ""}
<p class="book-author">${escapeXml(book.author)}</p>
${book.details.imprint ? `<p class="book-imprint">${escapeXml(book.details.imprint)}</p>` : ""}
</section>`;
  }
  if (s.special === "copyright") {
    return `<section class="copyright" epub:type="copyright-page">${copyrightLines(book, opts.recordUrl)
      .map((l) => `<p>${escapeXml(l)}</p>`)
      .join("\n")}</section>`;
  }
  if (s.special === "toc") {
    const links = opts.tocLinks || book.chapters.map((c) => ({ label: c.tocLabel, href: "#" }));
    return `<nav class="toc" epub:type="toc"><h1 class="matter-title">${escapeXml(s.title || "Contents")}</h1><ol>${links
      .map((l) => `<li><a href="${escapeXml(l.href)}">${escapeXml(l.label)}</a></li>`)
      .join("")}</ol></nav>`;
  }
  const centered = s.kind === "front_dedication" || s.kind === "front_epigraph";
  const cls = centered ? (s.kind === "front_dedication" ? "dedication" : "epigraph") : "matter";
  return `<section class="${cls}">${s.showTitle ? `<h1 class="matter-title">${escapeXml(s.title)}</h1>` : ""}
${renderBlocks(s.blocks, { opening: "none", ornament, matter: true })}
</section>`;
}

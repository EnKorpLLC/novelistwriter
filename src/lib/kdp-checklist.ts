import type { Chapter } from "@/lib/types";
import { PRINT_SIZES, TRIM_SIZES, normalizeFormat, type FormatSettings } from "@/lib/book/format";
import { KDP_MAX_PAGES, KDP_MIN_PAGES, printMargins } from "@/lib/book/print";

/** ok: true = done, false = needs attention, null = optional or can't be checked here */
export type CheckItem = { id: string; label: string; ok: boolean | null; detail?: string };

type MatterRow = { matter_type: string; enabled: boolean };

/** The Tools tab checklist, evaluated from the book itself. */
export function kdpChecklist(input: {
  formatSettings: unknown;
  matter: MatterRow[];
  blurb: string;
  categories: string;
  keywordCount: number;
}): CheckItem[] {
  const format = normalizeFormat(input.formatSettings);
  const has = (type: string) => input.matter.some((m) => m.enabled && m.matter_type === type);
  const trimLabel = TRIM_SIZES.find((t) => t.id === format.trim)?.label || format.trim;
  return [
    {
      id: "print",
      label: "Paperback layout checked",
      ok: format.lastPageCount ? true : null,
      detail: format.lastPageCount
        ? `${format.lastPageCount} pages at ${trimLabel}, margins set for that page count`
        : "Open the print layout from the Format tab (Pro)",
    },
    {
      id: "copyright",
      label: "Copyright page",
      ok: has("front_copyright") || format.autoCopyright,
      detail: format.autoCopyright ? "Built from your book details" : undefined,
    },
    { id: "toc", label: "Table of contents", ok: has("front_toc") },
    { id: "blurb", label: "Book description drafted", ok: input.blurb.trim().length >= 100, detail: "At least a short paragraph" },
    { id: "categories", label: "BISAC categories filled from genre keywords", ok: input.categories.trim().length > 0 },
    { id: "keywords", label: "Genre keywords selected", ok: input.keywordCount > 0 },
    { id: "epub", label: "Ebook built", ok: null, detail: "Styled EPUB in the Format tab, or the basic build below" },
  ];
}

/** Checks for the paperback interior, run after each print layout. */
export function printChecklist(input: {
  pages: number;
  format: FormatSettings;
  hasTitlePage: boolean;
  hasCopyright: boolean;
  isbnPrint: string;
  hasImages?: boolean;
}): CheckItem[] {
  const { pages, format } = input;
  const m = printMargins(format.trim, pages);
  const max = KDP_MAX_PAGES[format.paper];
  const pt = PRINT_SIZES.find((p) => p.id === format.printSize)?.pt ?? 11;
  const items: CheckItem[] = [
    {
      id: "pages",
      label: "Page count within KDP limits",
      ok: pages >= KDP_MIN_PAGES && pages <= max,
      detail:
        pages < KDP_MIN_PAGES
          ? `${pages} pages. KDP paperbacks need at least ${KDP_MIN_PAGES}.`
          : pages > max
            ? `${pages} pages. KDP allows up to ${max} on ${format.paper} paper; try a larger trim or a smaller text size.`
            : `${pages} pages (${KDP_MIN_PAGES} to ${max} allowed on ${format.paper} paper)`,
    },
    {
      id: "gutter",
      label: "Inside margin fits the page count",
      ok: m.inside >= m.kdpMinimum,
      detail: `${m.inside}" inside (KDP minimum ${m.kdpMinimum}" for ${pages} pages)`,
    },
    {
      id: "outside",
      label: "Outside, top, and bottom margins",
      ok: Math.min(m.outside, m.top, m.bottom) >= 0.25,
      detail: `${m.outside}" outside, ${m.top}" top, ${m.bottom}" bottom (KDP minimum 0.25")`,
    },
    { id: "fonts", label: "Fonts embedded", ok: true, detail: "Open-licensed fonts, embedded when you save the PDF" },
    {
      id: "bleed",
      label: "No bleed needed",
      ok: true,
      detail: input.hasImages
        ? "Images sit inside the margins; choose \"No bleed\" when you upload"
        : "Text-only interior; choose \"No bleed\" when you upload",
    },
    { id: "title", label: "Title page", ok: input.hasTitlePage },
    { id: "copyright", label: "Copyright page", ok: input.hasCopyright },
    {
      id: "blank",
      label: "Blank pages",
      ok: true,
      detail: format.chapterStartRight
        ? "Single blank pages before right-hand chapter openings, which KDP accepts"
        : "Only where a section must start on a right-hand page",
    },
    {
      id: "isbn",
      label: "Print ISBN",
      ok: input.isbnPrint ? true : null,
      detail: input.isbnPrint ? input.isbnPrint : "Optional: KDP can assign a free ISBN. Add yours in Book details.",
    },
  ];
  if (format.printSize === "largeprint") {
    items.push({ id: "largeprint", label: "Large print size", ok: pt >= 16, detail: "KDP's large print label needs 16 pt or larger" });
  }
  return items;
}

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

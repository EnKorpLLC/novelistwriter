/** Book formatting settings and details. Client-safe: used by the Format tab, previews, and exports. */

export type ChapterKind = "chapter" | "unnumbered" | "part";
export type HeadingFormat = "chapter_word" | "chapter_number" | "number" | "word_upper" | "title_only";
export type FirstLine = "style" | "dropcap" | "smallcaps" | "none";
export type TrimSize = "5x8" | "5.06x7.81" | "5.25x8" | "5.5x8.5" | "6x9";
export type PrintSize = "small" | "standard" | "large" | "largeprint";
export type Paper = "cream" | "white";
export type Printer = "kdp" | "ingram";

export type FormatSettings = {
  style: string;
  /** null = the style's default */
  headingFormat: HeadingFormat | null;
  showChapterTitles: boolean;
  firstLine: FirstLine;
  /** null = the style's ornament */
  sceneBreak: string | null;
  chapterKinds: Record<string, ChapterKind>;
  titlePage: boolean;
  autoCopyright: boolean;
  autoAlsoBy: boolean;
  trim: TrimSize;
  printSize: PrintSize;
  chapterStartRight: boolean;
  runningHeads: boolean;
  paper: Paper;
  printer: Printer;
  /** From the last print layout; the cover calculator uses it */
  lastPageCount: number | null;
};

export type BookDetails = {
  penName: string;
  seriesName: string;
  seriesNumber: string;
  isbnEbook: string;
  isbnPrint: string;
  imprint: string;
  edition: string;
  copyrightYear: string;
  copyrightHolder: string;
  humanStatement: boolean;
};

export const HEADING_FORMATS: { id: HeadingFormat; label: string; example: string }[] = [
  { id: "chapter_word", label: "Chapter One", example: "Chapter One" },
  { id: "chapter_number", label: "Chapter 1", example: "Chapter 1" },
  { id: "number", label: "1", example: "1" },
  { id: "word_upper", label: "ONE", example: "ONE" },
  { id: "title_only", label: "Title only", example: "The Storm" },
];

export const SCENE_BREAKS = ["* * *", "• • •", "◆", "~ ~ ~", "⁂", "§"];

export const TRIM_SIZES: { id: TrimSize; label: string }[] = [
  { id: "5x8", label: '5" x 8"' },
  { id: "5.06x7.81", label: '5.06" x 7.81"' },
  { id: "5.25x8", label: '5.25" x 8"' },
  { id: "5.5x8.5", label: '5.5" x 8.5"' },
  { id: "6x9", label: '6" x 9"' },
];

export const PRINT_SIZES: { id: PrintSize; label: string; pt: number }[] = [
  { id: "small", label: "Compact (10 pt)", pt: 10 },
  { id: "standard", label: "Standard (11 pt)", pt: 11 },
  { id: "large", label: "Roomy (12 pt)", pt: 12 },
  { id: "largeprint", label: "Large print (16 pt)", pt: 16 },
];

export const DEFAULT_FORMAT: FormatSettings = {
  style: "classic",
  headingFormat: null,
  showChapterTitles: true,
  firstLine: "style",
  sceneBreak: null,
  chapterKinds: {},
  titlePage: true,
  autoCopyright: true,
  autoAlsoBy: true,
  trim: "6x9",
  printSize: "standard",
  chapterStartRight: false,
  runningHeads: true,
  paper: "cream",
  printer: "kdp",
  lastPageCount: null,
};

export const EMPTY_DETAILS: BookDetails = {
  penName: "",
  seriesName: "",
  seriesNumber: "",
  isbnEbook: "",
  isbnPrint: "",
  imprint: "",
  edition: "",
  copyrightYear: "",
  copyrightHolder: "",
  humanStatement: true,
};

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function normalizeFormat(raw: unknown): FormatSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kinds: Record<string, ChapterKind> = {};
  if (o.chapterKinds && typeof o.chapterKinds === "object") {
    for (const [id, k] of Object.entries(o.chapterKinds as Record<string, unknown>)) {
      if (k === "chapter" || k === "unnumbered" || k === "part") kinds[id] = k;
    }
  }
  const heading = HEADING_FORMATS.some((h) => h.id === o.headingFormat) ? (o.headingFormat as HeadingFormat) : null;
  const firstLine = ["style", "dropcap", "smallcaps", "none"].includes(o.firstLine as string)
    ? (o.firstLine as FirstLine)
    : "style";
  const trim = TRIM_SIZES.some((t) => t.id === o.trim) ? (o.trim as TrimSize) : DEFAULT_FORMAT.trim;
  return {
    style: str(o.style, 40) || DEFAULT_FORMAT.style,
    headingFormat: heading,
    showChapterTitles: o.showChapterTitles !== false,
    firstLine,
    sceneBreak: SCENE_BREAKS.includes(o.sceneBreak as string) ? (o.sceneBreak as string) : null,
    chapterKinds: kinds,
    titlePage: o.titlePage !== false,
    autoCopyright: o.autoCopyright !== false,
    autoAlsoBy: o.autoAlsoBy !== false,
    trim,
    printSize: PRINT_SIZES.some((p) => p.id === o.printSize) ? (o.printSize as PrintSize) : DEFAULT_FORMAT.printSize,
    chapterStartRight: o.chapterStartRight === true,
    runningHeads: o.runningHeads !== false,
    paper: o.paper === "white" ? "white" : "cream",
    printer: o.printer === "ingram" ? "ingram" : "kdp",
    lastPageCount:
      Number.isFinite(Number(o.lastPageCount)) && Number(o.lastPageCount) > 0 ? Math.round(Number(o.lastPageCount)) : null,
  };
}

export function normalizeDetails(raw: unknown): BookDetails {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    penName: str(o.penName, 80),
    seriesName: str(o.seriesName, 120),
    seriesNumber: str(o.seriesNumber, 10),
    isbnEbook: str(o.isbnEbook, 20).replace(/[^0-9Xx-]/g, ""),
    isbnPrint: str(o.isbnPrint, 20).replace(/[^0-9Xx-]/g, ""),
    imprint: str(o.imprint, 80),
    edition: str(o.edition, 60),
    copyrightYear: str(o.copyrightYear, 4).replace(/[^0-9]/g, ""),
    copyrightHolder: str(o.copyrightHolder, 120),
    humanStatement: o.humanStatement !== false,
  };
}

/* ---------- Chapter kinds and headings ---------- */

const UNNUMBERED = /^\s*(prologue|epilogue|interlude|afterword|foreword|preface|introduction|coda|postscript)\b/i;
const PART = /^\s*part\s+([ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;
/** "Chapter 3: The Storm", "Chapter Three - The Storm", "Ch. 3." */
const CHAPTER_PREFIX = /^\s*(chapter|ch\.?)\s+([0-9]+|[a-z-]+)\s*([:.\-–—]\s*)?/i;

export function detectChapterKind(title: string): ChapterKind {
  if (PART.test(title)) return "part";
  if (UNNUMBERED.test(title)) return "unnumbered";
  return "chapter";
}

/** The chapter's own name without a leading "Chapter 3:" label. */
export function chapterName(title: string): string {
  const t = String(title || "").trim();
  if (!CHAPTER_PREFIX.test(t)) return t;
  return t.replace(CHAPTER_PREFIX, "").trim();
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberToWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) {
    const rest = n % 100;
    return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` ${numberToWords(rest)}` : ""}`;
  }
  return String(n);
}

const titleCase = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_m, p, c) => p + c.toUpperCase());

/** The label shown above a numbered chapter's title, or null when the format shows the title only. */
export function chapterLabel(format: HeadingFormat, n: number): string | null {
  switch (format) {
    case "chapter_word":
      return `Chapter ${titleCase(numberToWords(n))}`;
    case "chapter_number":
      return `Chapter ${n}`;
    case "number":
      return String(n);
    case "word_upper":
      return numberToWords(n).toUpperCase();
    default:
      return null;
  }
}

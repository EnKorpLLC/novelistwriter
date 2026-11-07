/** Paperback cover wrap and ebook cover checks. Client-safe; all sizes in inches. */
import type { Paper, Printer, TrimSize } from "@/lib/book/format";
import { KDP_MIN_PAGES, TRIM_INCHES } from "@/lib/book/print";

/** Paper thickness per page (inches). KDP publishes these; IngramSpark is close but confirm with their generator. */
export const PAGE_THICKNESS: Record<Paper, number> = { white: 0.002252, cream: 0.0025 };

export const BLEED = 0.125;
/** Keep text and important art this far inside the trim line */
export const SAFE = 0.125;
/** Keep spine text this far from each spine fold */
export const SPINE_SAFE = 0.0625;
/** KDP only allows spine text on books with more than 79 pages */
export const SPINE_TEXT_MIN_PAGES = 80;
export const BARCODE = { w: 2, h: 1.2, inset: 0.25 };

export type Rect = { x: number; y: number; w: number; h: number };

export type CoverWrap = {
  printer: Printer;
  trim: { w: number; h: number };
  pages: number;
  paper: Paper;
  spine: number;
  bleed: number;
  /** Full sheet including bleed */
  width: number;
  height: number;
  back: Rect;
  spineRect: Rect;
  front: Rect;
  backSafe: Rect;
  frontSafe: Rect;
  spineSafe: Rect | null;
  barcode: Rect;
  spineText: boolean;
  warnings: string[];
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function coverWrap(input: { trim: TrimSize; pages: number; paper: Paper; printer: Printer }): CoverWrap {
  const trim = TRIM_INCHES[input.trim];
  const pages = Math.max(1, Math.round(input.pages));
  const spine = r3(pages * PAGE_THICKNESS[input.paper]);
  const b = BLEED;
  const width = r3(b + trim.w + spine + trim.w + b);
  const height = r3(b + trim.h + b);

  const back: Rect = { x: b, y: b, w: trim.w, h: trim.h };
  const spineRect: Rect = { x: r3(b + trim.w), y: b, w: spine, h: trim.h };
  const front: Rect = { x: r3(b + trim.w + spine), y: b, w: trim.w, h: trim.h };
  const inset = (r: Rect, d: number): Rect => ({ x: r3(r.x + d), y: r3(r.y + d), w: r3(r.w - 2 * d), h: r3(r.h - 2 * d) });
  const spineSafe = spine > 2 * SPINE_SAFE ? { x: r3(spineRect.x + SPINE_SAFE), y: r3(b + SAFE), w: r3(spine - 2 * SPINE_SAFE), h: r3(trim.h - 2 * SAFE) } : null;
  const barcode: Rect = {
    x: r3(back.x + back.w - BARCODE.inset - BARCODE.w),
    y: r3(back.y + back.h - BARCODE.inset - BARCODE.h),
    w: BARCODE.w,
    h: BARCODE.h,
  };

  const warnings: string[] = [];
  if (pages < KDP_MIN_PAGES) warnings.push(`Paperbacks need at least ${KDP_MIN_PAGES} pages.`);
  const spineText = pages >= SPINE_TEXT_MIN_PAGES;
  if (!spineText) warnings.push(`Under ${SPINE_TEXT_MIN_PAGES} pages, leave the spine blank. KDP rejects spine text on thinner books.`);
  if (input.printer === "ingram") {
    warnings.push("IngramSpark's spine can differ slightly by paper. Check the width against their free cover template generator.");
  }

  return {
    printer: input.printer,
    trim,
    pages,
    paper: input.paper,
    spine,
    bleed: b,
    width,
    height,
    back,
    spineRect,
    front,
    backSafe: inset(back, SAFE),
    frontSafe: inset(front, SAFE),
    spineSafe,
    barcode,
    spineText,
    warnings,
  };
}

/* ---------- Ebook cover ---------- */

export const EBOOK_IDEAL = { w: 1600, h: 2560 };
export const EBOOK_MIN = { w: 625, h: 1000 };

export type EbookCoverCheck = { ok: boolean | null; label: string; detail?: string };

export function checkEbookCover(img: { width: number; height: number; type: string; bytes?: number }): EbookCoverCheck[] {
  const ratio = img.height / img.width;
  const checks: EbookCoverCheck[] = [
    {
      label: "Size",
      ok: img.width >= EBOOK_MIN.w && img.height >= EBOOK_MIN.h,
      detail:
        img.width >= EBOOK_IDEAL.w && img.height >= EBOOK_IDEAL.h
          ? `${img.width} × ${img.height} px. Sharp on every screen.`
          : img.width >= EBOOK_MIN.w && img.height >= EBOOK_MIN.h
            ? `${img.width} × ${img.height} px. Stores accept it, but ${EBOOK_IDEAL.w} × ${EBOOK_IDEAL.h} looks sharper.`
            : `${img.width} × ${img.height} px. Stores need at least ${EBOOK_MIN.w} × ${EBOOK_MIN.h}.`,
    },
    {
      label: "Shape",
      ok: ratio >= 1.5 && ratio <= 1.7 ? true : ratio >= 1.3 && ratio <= 1.8 ? null : false,
      detail: `${ratio.toFixed(2)} times as tall as it is wide. Stores show covers at about 1.6, so other shapes get bars or cropping.`,
    },
    {
      label: "File",
      ok: img.type === "image/jpeg" ? true : null,
      detail:
        img.type === "image/jpeg"
          ? `JPEG${img.bytes ? `, ${(img.bytes / 1024 / 1024).toFixed(1)} MB` : ""}`
          : "JPEG works best in stores. Upload it again and we'll convert it.",
    },
  ];
  return checks;
}

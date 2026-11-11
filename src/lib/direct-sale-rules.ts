/** Direct sales rules shared by the Sell tab, checkout, and payouts. Client-safe. */

export const SALE_FEES = {
  pro: { pct: 0.1, fixedCents: 15 },
  studio: { pct: 0.05, fixedCents: 15 },
} as const;
export type SellerTier = keyof typeof SALE_FEES;

/** Stripe's standard US card fee; the real fee for each sale is read from Stripe afterward. */
export const STRIPE_PCT = 0.029;
export const STRIPE_FIXED_CENTS = 30;

export const MIN_PRICE_CENTS = 99;
export const MAX_PRICE_CENTS = 9999;
export const PAYOUT_MIN_CENTS = 5000;
export const REFUND_WINDOW_DAYS = 14;

export type DirectSale = {
  on: boolean;
  /** Reader magnet (Studio): free for joining the author's list */
  magnet: boolean;
  /** Before release: charge now, deliver when the book is marked out now */
  preorder: boolean;
  priceCents: number;
  salePriceCents: number | null;
  saleStarts: string | null;
  saleEnds: string | null;
};

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const cents = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_PRICE_CENTS, Math.max(MIN_PRICE_CENTS, n)) : null;
};

export function normalizeDirectSale(raw: unknown): DirectSale {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const price = cents(o.priceCents) ?? 499;
  const sale = o.salePriceCents == null || o.salePriceCents === "" ? null : cents(o.salePriceCents);
  return {
    on: o.on === true,
    magnet: o.magnet === true,
    preorder: o.preorder === true,
    priceCents: price,
    salePriceCents: sale != null && sale < price ? sale : null,
    saleStarts: day(o.saleStarts),
    saleEnds: day(o.saleEnds),
  };
}

/** The price right now, and the regular price when a sale is running. */
export function currentPrice(s: DirectSale, today = new Date().toISOString().slice(0, 10)): { cents: number; regularCents: number | null } {
  const onSale = s.salePriceCents != null && (!s.saleStarts || s.saleStarts <= today) && (!s.saleEnds || s.saleEnds >= today);
  return onSale ? { cents: s.salePriceCents!, regularCents: s.priceCents } : { cents: s.priceCents, regularCents: null };
}

export function platformFeeCents(priceCents: number, tier: SellerTier) {
  const f = SALE_FEES[tier];
  return Math.round(priceCents * f.pct) + f.fixedCents;
}

/** What the author keeps from one sale, using Stripe's standard fee (sales tax is added on top, so it's not counted). */
export function estimateShare(priceCents: number, tier: SellerTier) {
  const stripe = Math.round(priceCents * STRIPE_PCT) + STRIPE_FIXED_CENTS;
  const fee = platformFeeCents(priceCents, tier);
  return { stripeCents: stripe, feeCents: fee, authorCents: Math.max(0, priceCents - stripe - fee) };
}

export const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Pre-orders open this many days before release, which keeps every refund well inside what card networks allow. */
export const PREORDER_MAX_DAYS = 90;
/** A pre-order still waiting this many days after the date its buyer was promised is refunded automatically. */
export const PREORDER_GRACE_DAYS = 30;

const DAY = 86_400_000;
export const addDays = (isoDay: string, days: number) => new Date(Date.parse(`${isoDay.slice(0, 10)}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const longDay = (isoDay: string) =>
  new Date(`${isoDay.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Why pre-orders can't open for this release date, or null when they can. */
export function preorderProblem(releaseDate: string | null | undefined, today = new Date().toISOString().slice(0, 10)): string | null {
  if (!releaseDate) return "Set a release date on the Launch page tab first.";
  if (releaseDate.slice(0, 10) <= today) return "The release date has arrived. Mark the book out now to deliver pre-orders and start selling, or move the date.";
  const opens = addDays(releaseDate, -PREORDER_MAX_DAYS);
  if (opens > today) return `Pre-orders open ${PREORDER_MAX_DAYS} days before release, on ${longDay(opens)}.`;
  return null;
}

/** Digital extras: character art, maps, bonus writing. */
export type ExtraKind = "art" | "writing";
export const EXTRA_KINDS: { id: ExtraKind; label: string }[] = [
  { id: "art", label: "Art or maps (images)" },
  { id: "writing", label: "Bonus writing (PDF or EPUB)" },
];
export const EXTRA_MAX_FILES = 10;
export const EXTRA_MAX_BYTES = 200 * 1024 * 1024;
export const EXTRAS_PER_BOOK = 20;
const EXTRA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  epub: "application/epub+zip",
  mp3: "audio/mpeg",
  zip: "application/zip",
};
export const EXTRA_ACCEPT = Object.keys(EXTRA_TYPES).map((e) => `.${e}`).join(",");
/** The content type for an allowed extra file, or null if that kind of file can't be sold. */
export const extraFileType = (name: string) => EXTRA_TYPES[name.split(".").pop()?.toLowerCase() || ""] || null;

export type ExtraFile = { name: string; key: string; bytes: number };
export type BookExtra = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  kind: ExtraKind;
  priceCents: number | null;
  withEbook: boolean;
  files: ExtraFile[];
  active: boolean;
};

/** Per book: the audiobook for sale, and "ebook + audiobook" at one price. */
export type AudiobookSale = { on: boolean; priceCents: number; bundlePriceCents: number | null; humanNarrated: boolean };

export function normalizeAudiobookSale(raw: unknown): AudiobookSale {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const price = cents(o.priceCents) ?? 1499;
  return {
    on: o.on === true,
    priceCents: price,
    bundlePriceCents: o.bundlePriceCents == null || o.bundlePriceCents === "" ? null : cents(o.bundlePriceCents),
    humanNarrated: o.humanNarrated !== false,
  };
}

/** A CBR MP3's length from its size (our exports are 192 kbps), in milliseconds. */
export const mp3Ms = (bytes: number, kbps = 192) => Math.round((bytes * 8) / kbps);

export type DiscountCode = {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  projectIds: string[];
  maxUses: number | null;
  uses: number;
  endsOn: string | null;
  active: boolean;
};

/** Letters, numbers, and dashes, 3 to 24 long, compared without case. */
export function normalizeCode(raw: unknown): string | null {
  const c = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9-]{3,24}$/.test(c) ? c : null;
}

/** The price after a code; never below the minimum, so a code can't make a book free (that's what reader magnets are for). */
export function discountedPrice(priceCents: number, code: Pick<DiscountCode, "percentOff" | "amountOffCents">): number {
  const off = code.percentOff ? Math.round((priceCents * code.percentOff) / 100) : code.amountOffCents || 0;
  return Math.max(MIN_PRICE_CENTS, priceCents - off);
}

export function codeUsable(code: DiscountCode, projectId: string, today = new Date().toISOString().slice(0, 10)): string | null {
  if (!code.active) return "That code has been turned off.";
  if (code.endsOn && code.endsOn < today) return "That code has expired.";
  if (code.maxUses != null && code.uses >= code.maxUses) return "That code has been used up.";
  if (code.projectIds.length && !code.projectIds.includes(projectId)) return "That code doesn't work for this book.";
  return null;
}

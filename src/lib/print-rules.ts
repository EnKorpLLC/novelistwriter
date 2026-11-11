/** Paperbacks printed by Lulu and sold direct. Client-safe: the Sell tab, the launch page, and checkout share these. */
import { STRIPE_FIXED_CENTS, STRIPE_PCT, platformFeeCents, type SellerTier } from "@/lib/direct-sale-rules";
import type { TrimSize } from "@/lib/book/format";

/** Trim sizes Lulu prints as standard paperbacks, by our trim id. */
export const LULU_TRIMS: Partial<Record<TrimSize, string>> = {
  "5x8": "0500X0800",
  "5.5x8.5": "0550X0850",
  "6x9": "0600X0900",
};
export const LULU_TRIM_OPTIONS: { id: TrimSize; label: string }[] = [
  { id: "5x8", label: '5" × 8"' },
  { id: "5.5x8.5", label: '5.5" × 8.5"' },
  { id: "6x9", label: '6" × 9"' },
];

export type PrintFinish = "matte" | "gloss";
export type PrintPaper = "cream" | "white";

/** Lulu's product code: black and white, standard quality, perfect bound, 60# paper, matte or gloss cover. */
export function podPackageId(trim: string, paper: PrintPaper, finish: PrintFinish): string | null {
  const t = LULU_TRIMS[trim as TrimSize];
  if (!t) return null;
  return `${t}.BW.STD.PB.${paper === "white" ? "060UW444" : "060UC444"}.${finish === "gloss" ? "G" : "M"}XX`;
}

export const MIN_PAGES = 32;
export const MAX_PAGES = 800;
export const MIN_PRINT_PRICE_CENTS = 499;
/** An author keeps at least this much per copy after printing and fees. */
export const MIN_MARGIN_CENTS = 100;

export const SHIPPING_LEVELS = [
  { id: "MAIL", label: "Standard mail", note: "about 1 to 2 weeks after printing" },
  { id: "GROUND", label: "Ground", note: "about 4 to 8 business days after printing" },
  { id: "EXPEDITED", label: "Expedited", note: "about 2 to 3 business days after printing" },
] as const;
export type ShippingLevel = (typeof SHIPPING_LEVELS)[number]["id"];
export const isShippingLevel = (v: unknown): v is ShippingLevel => SHIPPING_LEVELS.some((l) => l.id === v);

/** Printing takes about this long before a book ships. */
export const PRINT_DAYS = "3 to 5 business days";
/** The buyer can cancel this soon after ordering, while Lulu holds the job before printing. */
export const CANCEL_MINUTES = 60;

export const US_STATES =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

/**
 * What the author keeps on one paperback sold direct: the price, less printing (with Lulu's fulfillment fee), our fee, and
 * Stripe's fee on the whole charge (shipping included, estimated). The buyer pays shipping at cost.
 */
export function paperbackShare(priceCents: number, printCents: number, tier: SellerTier, shippingCents = 600) {
  const fee = platformFeeCents(priceCents, tier);
  const stripe = Math.round((priceCents + shippingCents) * STRIPE_PCT) + STRIPE_FIXED_CENTS;
  return { feeCents: fee, stripeCents: stripe, printCents, authorCents: priceCents - fee - stripe - printCents };
}

/** KDP's paperback royalty for comparison: 60% of the list price less KDP's printing (black ink, 110+ pages: $1.00 + 1.2¢ a page). */
export function kdpPaperbackRoyalty(priceCents: number, pages: number) {
  const print = pages >= 110 ? 100 + Math.round(1.2 * pages) : 230;
  return Math.max(0, Math.round(priceCents * 0.6) - print);
}

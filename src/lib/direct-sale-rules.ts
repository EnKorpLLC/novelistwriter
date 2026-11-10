/** Direct sales rules shared by the Launch tab, checkout, and payouts. Client-safe. */

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

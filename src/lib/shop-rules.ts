/** Things an author ships themselves: signed books, bookmarks, prints. Client-safe. */

export type ItemKind = "signed_book" | "bookmark" | "print" | "sticker" | "other";
export const ITEM_KINDS: { id: ItemKind; label: string; isBook: boolean }[] = [
  { id: "signed_book", label: "Signed book", isBook: true },
  { id: "bookmark", label: "Bookmark", isBook: false },
  { id: "print", label: "Art print", isBook: false },
  { id: "sticker", label: "Sticker", isBook: false },
  { id: "other", label: "Something else", isBook: false },
];

/** Stripe's categories: printed books, and general physical goods for everything else. */
export const itemTaxCode = (kind: string) => (kind === "signed_book" ? "txcd_35010000" : "txcd_99999999");

export const MAX_QUANTITY = 5;
export const PERSONALIZE_MAX = 60;
/** Orders over this need a tracking number when marked shipped. */
export const TRACKING_REQUIRED_OVER_CENTS = 2000;
/** An order still not shipped this many days after its ship-by date is refunded, and the shop pauses. */
export const LATE_GRACE_DAYS = 5;
/** Buyers' addresses disappear from the author's orders page this long after shipping. */
export const ADDRESS_HIDE_DAYS = 90;

export const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"];

export type ShopItem = {
  id: string;
  projectId: string | null;
  kind: ItemKind;
  title: string;
  description: string;
  priceCents: number;
  stock: number;
  personalize: boolean;
  active: boolean;
  photoUrl: string | null;
};
export type ShopSettings = { shipFirstCents: number; shipEachCents: number; handlingDays: number; pausedReason: string | null };

export const shippingFor = (s: Pick<ShopSettings, "shipFirstCents" | "shipEachCents">, quantity: number) => s.shipFirstCents + s.shipEachCents * Math.max(0, quantity - 1);

/** A date this many business days (Monday to Friday) after the given one, as YYYY-MM-DD. */
export function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

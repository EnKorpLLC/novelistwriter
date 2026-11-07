/** Ebook stores for per-store builds. Client-safe. */

export type StoreId = "kindle" | "apple" | "kobo" | "google" | "bn" | "generic";

export const STORES: { id: StoreId; label: string; reviewLabel: string; url?: RegExp; name?: RegExp }[] = [
  { id: "kindle", label: "Kindle (Amazon KDP)", reviewLabel: "Amazon", url: /(^|\.)amazon\.[a-z.]+$|(^|\.)amzn\.(to|com)$/, name: /amazon|kindle/i },
  { id: "apple", label: "Apple Books", reviewLabel: "Apple Books", url: /(^|\.)(books|itunes)\.apple\.com$/, name: /apple/i },
  { id: "kobo", label: "Kobo", reviewLabel: "Kobo", url: /(^|\.)kobo\.com$/, name: /kobo/i },
  { id: "google", label: "Google Play Books", reviewLabel: "Google Play", url: /(^|\.)play\.google\.com$/, name: /google/i },
  { id: "bn", label: "Barnes & Noble", reviewLabel: "Barnes & Noble", url: /(^|\.)barnesandnoble\.com$/, name: /barnes|nook|b\s*&\s*n/i },
  { id: "generic", label: "Any other store", reviewLabel: "your favorite store" },
];

export function isStoreId(v: unknown): v is StoreId {
  return STORES.some((s) => s.id === v);
}

/** Which store a buy link points to, by its address first and then its label. */
export function storeOfLink(link: { label: string; url: string }): StoreId | null {
  let host = "";
  try {
    host = new URL(link.url).hostname.toLowerCase();
  } catch {
    host = "";
  }
  for (const s of STORES) if (s.url && host && s.url.test(host)) return s.id;
  for (const s of STORES) if (s.name && s.name.test(link.label)) return s.id;
  return null;
}

export function linkForStore<T extends { label: string; url: string }>(links: T[], store: StoreId): T | null {
  if (store === "generic") return null;
  return links.find((l) => storeOfLink(l) === store) || null;
}

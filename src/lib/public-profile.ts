/** Author website + social links, shared by the dashboard editor and public pages. */

export const PUBLIC_LINK_FIELDS = [
  { id: "website", label: "Website" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "facebook", label: "Facebook" },
  { id: "goodreads", label: "Goodreads" },
  { id: "amazon", label: "Amazon author page" },
] as const;

export type PublicLinkId = (typeof PUBLIC_LINK_FIELDS)[number]["id"];

export type LabeledLink = { label: string; url: string };

export type PublicLinks = Partial<Record<PublicLinkId, string>> & {
  extra?: LabeledLink[];
};

const MAX_EXTRA = 6;

export function normalizeUrl(raw: unknown): string {
  let s = String(raw || "").trim().slice(0, 500);
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

export function normalizeLabeledLinks(raw: unknown, max: number): LabeledLink[] {
  if (!Array.isArray(raw)) return [];
  const out: LabeledLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const url = normalizeUrl((item as { url?: unknown }).url);
    const label = String((item as { label?: unknown }).label || "").trim().slice(0, 60);
    if (!url || !label) continue;
    out.push({ label, url });
    if (out.length >= max) break;
  }
  return out;
}

export function normalizePublicLinks(raw: unknown): PublicLinks {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: PublicLinks = {};
  for (const f of PUBLIC_LINK_FIELDS) {
    const url = normalizeUrl(src[f.id]);
    if (url) out[f.id] = url;
  }
  const extra = normalizeLabeledLinks(src.extra, MAX_EXTRA);
  if (extra.length) out.extra = extra;
  return out;
}

/** Flatten to display order for public pages. */
export function publicLinkList(links: PublicLinks | null | undefined): LabeledLink[] {
  if (!links) return [];
  const list: LabeledLink[] = [];
  for (const f of PUBLIC_LINK_FIELDS) {
    const url = links[f.id];
    if (url) list.push({ label: f.label, url });
  }
  return [...list, ...(links.extra || [])];
}

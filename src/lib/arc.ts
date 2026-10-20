import { normalizeLabeledLinks, type LabeledLink } from "@/lib/public-profile";

export const MAX_REVIEW_LINKS = 6;
export const MAX_BUY_LINKS = 8;
export const MAX_TROPES = 8;
export const REMINDER_COOLDOWN_DAYS = 7;

export type ArcProjectState = {
  arc_open?: boolean | null;
  arc_deadline?: string | null;
};

export function isArcDeadlinePassed(deadline: string | null | undefined, now = Date.now()) {
  if (!deadline) return false;
  const t = Date.parse(deadline);
  return Number.isFinite(t) && t <= now;
}

/** ARC is live: opened by the author and the deadline has not passed. */
export function isArcWindowOpen(project: ArcProjectState, now = Date.now()): boolean {
  return Boolean(project.arc_open) && !isArcDeadlinePassed(project.arc_deadline, now);
}

export function normalizeReviewLinks(raw: unknown): LabeledLink[] {
  return normalizeLabeledLinks(raw, MAX_REVIEW_LINKS);
}

export function normalizeBuyLinks(raw: unknown): LabeledLink[] {
  return normalizeLabeledLinks(raw, MAX_BUY_LINKS);
}

export function normalizeTropes(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(",")
        .map((s) => s.trim());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const t = String(item || "").trim().slice(0, 40);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TROPES) break;
  }
  return out;
}

/** Stable key for "I posted this" checks on a review link. */
export function reviewSiteKey(link: LabeledLink): string {
  return link.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "site";
}

export type MailingAddress = {
  name: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  note: string;
};

export function normalizeMailingAddress(raw: unknown): MailingAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pick = (k: string, max = 120) => String(r[k] || "").trim().slice(0, max);
  const addr: MailingAddress = {
    name: pick("name"),
    street: pick("street", 200),
    city: pick("city"),
    region: pick("region"),
    postalCode: pick("postalCode", 20),
    country: pick("country"),
    note: pick("note", 500),
  };
  if (!addr.name || !addr.street || !addr.city || !addr.country) return null;
  return addr;
}

export function formatMailingAddress(a: MailingAddress | null | undefined): string {
  if (!a) return "";
  const cityLine = [a.city, a.region, a.postalCode].filter(Boolean).join(", ");
  return [a.name, a.street, cityLine, a.country].filter(Boolean).join(" · ");
}

/** Reminder cap: one per reader per cooldown window. */
export function canRemind(lastRemindedAt: string | null | undefined, now = Date.now()) {
  if (!lastRemindedAt) return true;
  const t = Date.parse(lastRemindedAt);
  if (!Number.isFinite(t)) return true;
  return now - t >= REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

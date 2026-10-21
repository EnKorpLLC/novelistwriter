/** Where a visitor first came from, kept in localStorage (not a cookie) until they sign up. */

const KEY = "nw_first_touch";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type FirstTouch = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer_host?: string;
  landing_path?: string;
  at?: number;
};

function clean(v: string | null | undefined) {
  const s = String(v || "").trim().toLowerCase().slice(0, 80);
  return s || undefined;
}

export function externalReferrerHost(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    return host && host !== window.location.hostname.replace(/^www\./, "") ? host : undefined;
  } catch {
    return undefined;
  }
}

export function utmFromUrl(): Pick<FirstTouch, "utm_source" | "utm_medium" | "utm_campaign"> {
  const q = new URLSearchParams(window.location.search);
  return {
    utm_source: clean(q.get("utm_source")),
    utm_medium: clean(q.get("utm_medium")),
    utm_campaign: clean(q.get("utm_campaign")),
  };
}

/** Save the first source we see; a newer ad click within 30 days replaces an older plain visit. */
export function captureFirstTouch() {
  try {
    const utm = utmFromUrl();
    const existing = readFirstTouch();
    const fresh = existing?.at && Date.now() - existing.at < MAX_AGE_MS;
    if (fresh && !(utm.utm_source && !existing?.utm_source)) return;
    const touch: FirstTouch = {
      ...utm,
      referrer_host: externalReferrerHost(),
      landing_path: window.location.pathname.slice(0, 120),
      at: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(touch));
  } catch {
    /* storage blocked */
  }
}

export function readFirstTouch(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FirstTouch) : null;
  } catch {
    return null;
  }
}

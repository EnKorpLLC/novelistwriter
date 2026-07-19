/** Match bible entities across nicknames, titles, and aliases. */

export type BibleCatalogEntry = {
  id: string;
  entry_type: string;
  name: string;
  summary?: string;
  speech_notes?: string;
  details?: Record<string, unknown>;
};

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function aliasesOf(entry: {
  name: string;
  details?: Record<string, unknown> | null;
}): string[] {
  const raw = entry.details?.aliases;
  const list = Array.isArray(raw) ? raw.map((a) => String(a)) : [];
  return [...new Set([entry.name, ...list].map((a) => a.trim()).filter(Boolean))];
}

function tokens(s: string): string[] {
  return normalizeName(s)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "lord",
  "lady",
  "sir",
  "dame",
  "miss",
  "mrs",
  "mr",
  "ms",
  "dr",
  "captain",
  "king",
  "queen",
  "prince",
  "princess",
  "duke",
  "duchess",
  "young",
  "old",
]);

/** True if two labels likely refer to the same entity. */
export function namesLikelySame(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // One is a substring of the other as a whole-word phrase
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = na.length <= nb.length ? na : nb;
    if (shorter.length >= 3) return true;
  }
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  // Shared distinctive token (e.g. "sera" / "beaufort")
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t));
  if (shared.some((t) => t.length >= 4)) return true;
  // Last-name style: last token matches and one is shorter
  if (ta[ta.length - 1] === tb[tb.length - 1] && ta[ta.length - 1].length >= 4) {
    return true;
  }
  return false;
}

export function findMatchingCatalogEntry(
  catalog: BibleCatalogEntry[],
  opts: { entry_type: string; name: string; aliases?: string[]; match_id?: string | null }
): BibleCatalogEntry | null {
  if (opts.match_id) {
    const byId = catalog.find((c) => c.id === opts.match_id && c.entry_type === opts.entry_type);
    if (byId) return byId;
  }
  const candidates = catalog.filter((c) => c.entry_type === opts.entry_type);
  const incoming = [opts.name, ...(opts.aliases || [])];
  for (const c of candidates) {
    const existing = aliasesOf(c);
    for (const inc of incoming) {
      for (const ex of existing) {
        if (namesLikelySame(inc, ex)) return c;
      }
    }
  }
  return null;
}

export function mergeAliasLists(...lists: (string[] | undefined)[]): string[] {
  const out = new Set<string>();
  for (const list of lists) {
    for (const a of list || []) {
      const t = a.trim();
      if (t) out.add(t);
    }
  }
  return [...out];
}

export function preferRicherText(a?: string, b?: string): string {
  const x = (a || "").trim();
  const y = (b || "").trim();
  if (!x) return y;
  if (!y) return x;
  if (y.length > x.length * 1.15) return y;
  // Prefer longer if substantially more content
  return x.length >= y.length ? x : y;
}

export function preferCanonicalName(current: string, incoming: string): string {
  const c = current.trim();
  const i = incoming.trim();
  if (!c) return i;
  if (!i) return c;
  // Prefer the longer / more formal form (more words or more chars)
  const cw = c.split(/\s+/).length;
  const iw = i.split(/\s+/).length;
  if (iw > cw) return i;
  if (cw > iw) return c;
  return i.length > c.length ? i : c;
}

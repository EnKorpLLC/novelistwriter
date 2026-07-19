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

/** Token-subset match: "Sera" ⊂ "Lady Sera Beaufort", "Lady Beaufort" ⊂ full name. */
export function namesContainmentMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) {
    return na.includes(nb) || nb.includes(na);
  }
  const aInB = ta.every((t) => tb.includes(t));
  const bInA = tb.every((t) => ta.includes(t));
  return aInB || bInA;
}

export type LocalMergeCluster = {
  keep: BibleCatalogEntry;
  merge: BibleCatalogEntry[];
  name: string;
  summary: string;
  speech_notes: string;
  aliases: string[];
};

/**
 * Deterministic clustering for one entry type.
 * Connects entries when one name's distinctive tokens are a subset of the other's
 * (covers nicknames/titles). Then union-find collapses chains
 * (Sera ↔ Lady Sera Beaufort ↔ Lady Beaufort).
 */
export function clusterEntriesForMerge(rows: BibleCatalogEntry[]): LocalMergeCluster[] {
  if (rows.length < 2) return [];

  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    let p = i;
    while (parent[p] !== p) p = parent[p];
    let x = i;
    while (parent[x] !== x) {
      const n = parent[x];
      parent[x] = p;
      x = n;
    }
    return p;
  };
  const union = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[b] = a;
  };

  for (let i = 0; i < rows.length; i++) {
    const ai = aliasesOf(rows[i]);
    for (let j = i + 1; j < rows.length; j++) {
      const aj = aliasesOf(rows[j]);
      let linked = false;
      outer: for (const x of ai) {
        for (const y of aj) {
          if (namesContainmentMatch(x, y)) {
            linked = true;
            break outer;
          }
        }
      }
      if (linked) union(i, j);
    }
  }

  const groups = new Map<number, BibleCatalogEntry[]>();
  for (let i = 0; i < rows.length; i++) {
    const root = find(i);
    const g = groups.get(root) || [];
    g.push(rows[i]);
    groups.set(root, g);
  }

  const clusters: LocalMergeCluster[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Prefer fullest formal name as keep
    const keep = [...group].sort((a, b) => {
      const aw = a.name.trim().split(/\s+/).length;
      const bw = b.name.trim().split(/\s+/).length;
      if (bw !== aw) return bw - aw;
      return b.name.length - a.name.length;
    })[0];

    const merge = group.filter((g) => g.id !== keep.id);
    let summary = keep.summary || "";
    let speech = keep.speech_notes || "";
    for (const m of merge) {
      summary = preferRicherText(summary, m.summary);
      speech = preferRicherText(speech, m.speech_notes);
    }
    const allNames = group.flatMap((g) => aliasesOf(g));
    const name = allNames.reduce((best, n) => preferCanonicalName(best, n), keep.name);
    const aliases = mergeAliasLists(allNames).filter(
      (a) => normalizeName(a) !== normalizeName(name)
    );

    clusters.push({
      keep,
      merge,
      name,
      summary,
      speech_notes: speech,
      aliases,
    });
  }

  return clusters;
}

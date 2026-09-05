/** Standardized catalog keywords (max 6 per book). Each maps to a BISAC category. */

export type BookKeyword = {
  id: string;
  label: string;
  /** Display string for KDP metadata.categories */
  bisac: string;
};

export const MAX_BOOK_KEYWORDS = 6;

export const BOOK_KEYWORDS: readonly BookKeyword[] = [
  { id: "romance", label: "Romance", bisac: "FIC027000 — FICTION / Romance / General" },
  {
    id: "romance-contemporary",
    label: "Contemporary Romance",
    bisac: "FIC027020 — FICTION / Romance / Contemporary",
  },
  {
    id: "romance-historical",
    label: "Historical Romance",
    bisac: "FIC027050 — FICTION / Romance / Historical / General",
  },
  {
    id: "romance-paranormal",
    label: "Paranormal Romance",
    bisac: "FIC027120 — FICTION / Romance / Paranormal / General",
  },
  {
    id: "romantic-suspense",
    label: "Romantic Suspense",
    bisac: "FIC027110 — FICTION / Romance / Suspense",
  },
  { id: "fantasy", label: "Fantasy", bisac: "FIC009000 — FICTION / Fantasy / General" },
  {
    id: "fantasy-epic",
    label: "Epic Fantasy",
    bisac: "FIC009020 — FICTION / Fantasy / Epic",
  },
  {
    id: "fantasy-urban",
    label: "Urban Fantasy",
    bisac: "FIC009060 — FICTION / Fantasy / Urban",
  },
  {
    id: "sci-fi",
    label: "Science Fiction",
    bisac: "FIC028000 — FICTION / Science Fiction / General",
  },
  {
    id: "sci-fi-space",
    label: "Space Opera",
    bisac: "FIC028030 — FICTION / Science Fiction / Space Opera",
  },
  { id: "horror", label: "Horror", bisac: "FIC015000 — FICTION / Horror / General" },
  { id: "thriller", label: "Thriller", bisac: "FIC031000 — FICTION / Thrillers / General" },
  {
    id: "mystery",
    label: "Mystery",
    bisac: "FIC022000 — FICTION / Mystery & Detective / General",
  },
  {
    id: "cozy-mystery",
    label: "Cozy Mystery",
    bisac: "FIC022070 — FICTION / Mystery & Detective / Cozy",
  },
  {
    id: "crime",
    label: "Crime",
    bisac: "FIC022020 — FICTION / Mystery & Detective / Police Procedural",
  },
  {
    id: "historical",
    label: "Historical Fiction",
    bisac: "FIC014000 — FICTION / Historical / General",
  },
  {
    id: "literary",
    label: "Literary Fiction",
    bisac: "FIC019000 — FICTION / Literary",
  },
  {
    id: "womens",
    label: "Women’s Fiction",
    bisac: "FIC044000 — FICTION / Women",
  },
  {
    id: "ya",
    label: "Young Adult",
    bisac: "YAF000000 — YOUNG ADULT FICTION / General",
  },
  {
    id: "ya-fantasy",
    label: "YA Fantasy",
    bisac: "YAF019000 — YOUNG ADULT FICTION / Fantasy / General",
  },
  {
    id: "ya-romance",
    label: "YA Romance",
    bisac: "YAF052000 — YOUNG ADULT FICTION / Romance / General",
  },
  {
    id: "middle-grade",
    label: "Middle Grade",
    bisac: "JUV000000 — JUVENILE FICTION / General",
  },
  {
    id: "adventure",
    label: "Adventure",
    bisac: "FIC002000 — FICTION / Action & Adventure",
  },
  {
    id: "lgbtq",
    label: "LGBTQ+",
    bisac: "FIC011000 — FICTION / LGBTQ+ / General",
  },
  {
    id: "christian",
    label: "Christian Fiction",
    bisac: "FIC042000 — FICTION / Christian / General",
  },
  {
    id: "western",
    label: "Western",
    bisac: "FIC033000 — FICTION / Westerns",
  },
  {
    id: "humor",
    label: "Humor",
    bisac: "FIC016000 — FICTION / Humorous / General",
  },
  {
    id: "dystopian",
    label: "Dystopian",
    bisac: "FIC055000 — FICTION / Dystopian",
  },
  {
    id: "memoir",
    label: "Memoir",
    bisac: "BIO026000 — BIOGRAPHY & AUTOBIOGRAPHY / Personal Memoirs",
  },
  {
    id: "self-help",
    label: "Self-Help",
    bisac: "SEL000000 — SELF-HELP / General",
  },
  {
    id: "business",
    label: "Business",
    bisac: "BUS000000 — BUSINESS & ECONOMICS / General",
  },
  {
    id: "history-nf",
    label: "History (Nonfiction)",
    bisac: "HIS000000 — HISTORY / General",
  },
  {
    id: "religion",
    label: "Religion & Spirituality",
    bisac: "REL000000 — RELIGION / General",
  },
  {
    id: "poetry",
    label: "Poetry",
    bisac: "POE000000 — POETRY / General",
  },
  {
    id: "short-stories",
    label: "Short Stories",
    bisac: "FIC029000 — FICTION / Short Stories (single author)",
  },
] as const;

const BY_ID = new Map(BOOK_KEYWORDS.map((k) => [k.id, k]));

export function bookKeywordById(id: string): BookKeyword | undefined {
  return BY_ID.get(id);
}

export function normalizeKeywordIds(raw: unknown): string[] {
  const ids: string[] = [];
  const push = (id: string) => {
    const k = BY_ID.get(id);
    if (k && !ids.includes(k.id)) ids.push(k.id);
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") push(item.trim());
      else if (item && typeof item === "object" && typeof (item as { id?: string }).id === "string") {
        push((item as { id: string }).id.trim());
      }
    }
  } else if (typeof raw === "string") {
    // Legacy free-text or comma-separated ids/labels
    for (const part of raw.split(/[,;|]/)) {
      const t = part.trim();
      if (!t) continue;
      if (BY_ID.has(t)) {
        push(t);
        continue;
      }
      const byLabel = BOOK_KEYWORDS.find((k) => k.label.toLowerCase() === t.toLowerCase());
      if (byLabel) push(byLabel.id);
    }
  }

  return ids.slice(0, MAX_BOOK_KEYWORDS);
}

export function keywordLabels(ids: string[]): string[] {
  return normalizeKeywordIds(ids)
    .map((id) => BY_ID.get(id)?.label)
    .filter((x): x is string => Boolean(x));
}

/** Up to two unique BISAC lines for KDP (primary + secondary). */
export function bisacFromKeywordIds(ids: string[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const id of normalizeKeywordIds(ids)) {
    const k = BY_ID.get(id);
    if (!k || seen.has(k.bisac)) continue;
    seen.add(k.bisac);
    lines.push(k.bisac);
    if (lines.length >= 2) break;
  }
  return lines.join("\n");
}

export function catalogLabelsForProject(project: {
  genre?: string | null;
  metadata?: Record<string, unknown> | null;
}): string[] {
  const meta = project.metadata || {};
  const fromIds = keywordLabels(
    normalizeKeywordIds(meta.keywordIds ?? meta.keywords)
  );
  if (fromIds.length) return fromIds;
  const g = String(project.genre || "").trim();
  return g ? [g] : ["Uncategorized"];
}

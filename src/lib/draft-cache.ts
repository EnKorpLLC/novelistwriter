/** Offline draft cache for manuscript chapters */
const PREFIX = "nw-draft:";

export type DraftCache = {
  html: string;
  text: string;
  wordCount: number;
  savedAt: number;
  /** True until a successful server save clears the cache */
  pendingSync?: boolean;
};

export function saveDraftLocal(
  chapterId: string,
  draft: Omit<DraftCache, "savedAt"> & { pendingSync?: boolean }
) {
  if (typeof window === "undefined") return;
  const payload: DraftCache = {
    ...draft,
    pendingSync: draft.pendingSync ?? true,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(`${PREFIX}${chapterId}`, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function loadDraftLocal(chapterId: string): DraftCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${PREFIX}${chapterId}`);
    return raw ? (JSON.parse(raw) as DraftCache) : null;
  } catch {
    return null;
  }
}

export function clearDraftLocal(chapterId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${PREFIX}${chapterId}`);
}

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function htmlToText(html: string): string {
  if (typeof window === "undefined") {
    return html
      .replace(/<hr\s*\/?>/gi, " ⁂ ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const div = document.createElement("div");
  div.innerHTML = html.replace(/<hr\s*\/?>/gi, " ⁂ ");
  return div.textContent || "";
}

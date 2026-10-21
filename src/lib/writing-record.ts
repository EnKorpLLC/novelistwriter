import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Requirements for the "Written in Novelist Writer" badge. */
export const RECORD_BADGE = {
  minTypedShare: 0.8,
  minSessions: 10,
  minSpanDays: 14,
  minRecordedWords: 500,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type WritingRecord = {
  currentWords: number;
  beforeRecordsWords: number;
  importedWords: number;
  /** Words written since records began (current minus before-records and imported) */
  recordedWords: number;
  /** Recorded words split by how the text arrived in the editor */
  typedWords: number;
  pastedWords: number;
  typedShare: number;
  sessions: number;
  flaggedSessions: number;
  activeDays: number;
  firstAt: string | null;
  lastAt: string | null;
  spanDays: number;
  revisions: number;
  /** Words typed per week, oldest first (estimated from characters) */
  weekly: { weekStart: string; words: number }[];
  badge: "written_here" | "before_records" | null;
  /** What's still missing for the badge; empty once earned */
  needed: string[];
};

function weekStart(iso: string) {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/** Process numbers only: how the book's text arrived, never the text itself. */
export async function computeWritingRecord(admin: SupabaseClient, projectId: string): Promise<WritingRecord> {
  const [{ data: chapters }, { data: sessions }] = await Promise.all([
    admin.from("chapters").select("id, word_count, imported_words, prerecord_words").eq("project_id", projectId),
    admin
      .from("writing_sessions")
      .select("started_at, ended_at, typed_chars, pasted_chars, flagged")
      .eq("project_id", projectId)
      .order("started_at", { ascending: true }),
  ]);
  const chapterIds = (chapters || []).map((c) => c.id);
  const { count: revisions } = chapterIds.length
    ? await admin.from("chapter_versions").select("id", { count: "exact", head: true }).in("chapter_id", chapterIds)
    : { count: 0 };

  let currentWords = 0;
  let beforeRecordsWords = 0;
  let importedWords = 0;
  for (const c of chapters || []) {
    const words = Math.max(0, c.word_count || 0);
    currentWords += words;
    // A chapter can shrink below its starting count after edits; never count more than it has
    const before = Math.min(words, Math.max(0, c.prerecord_words || 0));
    const imported = Math.min(words - before, Math.max(0, c.imported_words || 0));
    beforeRecordsWords += before;
    importedWords += imported;
  }
  const recordedWords = Math.max(0, currentWords - beforeRecordsWords - importedWords);

  const honest = (sessions || []).filter((s) => !s.flagged);
  const typedChars = honest.reduce((n, s) => n + (s.typed_chars || 0), 0);
  const pastedChars = honest.reduce((n, s) => n + (s.pasted_chars || 0), 0);
  const typedShare = typedChars + pastedChars > 0 ? typedChars / (typedChars + pastedChars) : 0;
  const typedWords = Math.round(recordedWords * typedShare);
  const pastedWords = recordedWords - typedWords;

  const days = new Set(honest.map((s) => String(s.started_at).slice(0, 10)));
  const firstAt = honest[0]?.started_at || null;
  const lastAt = honest.length ? honest[honest.length - 1].ended_at : null;
  const spanDays = firstAt && lastAt ? Math.floor((Date.parse(lastAt) - Date.parse(firstAt)) / DAY_MS) : 0;

  const byWeek = new Map<string, number>();
  for (const s of honest) {
    const key = weekStart(s.started_at);
    // About 5.5 characters per word including the space
    byWeek.set(key, (byWeek.get(key) || 0) + Math.round((s.typed_chars || 0) / 5.5));
  }
  const weekly = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([w, words]) => ({ weekStart: w, words }));

  const needed: string[] = [];
  if (honest.length < RECORD_BADGE.minSessions) {
    needed.push(`${RECORD_BADGE.minSessions - honest.length} more writing session${RECORD_BADGE.minSessions - honest.length === 1 ? "" : "s"}`);
  }
  if (spanDays < RECORD_BADGE.minSpanDays) {
    needed.push(`writing spread over ${RECORD_BADGE.minSpanDays} days (${spanDays} so far)`);
  }
  if (recordedWords < RECORD_BADGE.minRecordedWords) {
    needed.push(`${RECORD_BADGE.minRecordedWords - recordedWords} more words written here`);
  }
  if (typedShare < RECORD_BADGE.minTypedShare) {
    needed.push(`${Math.round(RECORD_BADGE.minTypedShare * 100)}% typed rather than pasted (${Math.round(typedShare * 100)}% now)`);
  }

  const badge =
    needed.length === 0
      ? ("written_here" as const)
      : recordedWords === 0 && beforeRecordsWords > 0
        ? ("before_records" as const)
        : null;

  return {
    currentWords,
    beforeRecordsWords,
    importedWords,
    recordedWords,
    typedWords,
    pastedWords,
    typedShare,
    sessions: honest.length,
    flaggedSessions: (sessions || []).length - honest.length,
    activeDays: days.size,
    firstAt,
    lastAt,
    spanDays,
    revisions: revisions || 0,
    weekly,
    badge,
    needed: badge === "written_here" ? [] : needed,
  };
}

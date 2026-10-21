import type { SupabaseClient } from "@supabase/supabase-js";

export type InsightsPhase = "beta" | "arc";

export type ReaderStatus = "finished" | "dnf" | "reading" | "stalled" | "not_started";

export type ReaderInsightRow = {
  id: string;
  name: string;
  status: ReaderStatus;
  joinedAt: string;
  startedAt: string | null;
  lastReadAt: string | null;
  finishedAt: string | null;
  bookPercent: number;
  furthestChapter: string | null;
  readingDays: number;
  avgGapDays: number | null;
  comments: number;
  atRisk: boolean;
  finishedOnTime: boolean | null;
  reviewsPosted: number;
};

export type ChapterInsight = {
  id: string;
  title: string;
  words: number;
  reached: number;
  completed: number;
  stoppedHere: number;
  comments: number;
};

export type ReaderInsights = {
  phase: InsightsPhase;
  chapterCount: number;
  totalWords: number;
  trackedSince: string | null;
  summary: {
    readers: number;
    started: number;
    finished: number;
    dnf: number;
    stalled: number;
    active7: number;
    completionRate: number | null;
    avgBookPercent: number;
    avgReadingDays: number | null;
    medianDaysToFinish: number | null;
    comments: number;
  };
  joinedBucket: "day" | "week";
  joined: { start: string; count: number }[];
  activity: { day: string; readers: number }[];
  weekdays: number[];
  returns: { label: string; readers: number }[];
  chapters: ChapterInsight[];
  biggestDrop: { title: string; stopped: number } | null;
  readers: ReaderInsightRow[];
  dnfReasons: { name: string; chapter: string | null; reason: string; at: string | null }[];
  arc: {
    deadline: string | null;
    daysLeft: number | null;
    finishedOnTime: number;
    finishedLate: number;
    missedDeadline: number;
    atRisk: number;
    finishedNoReview: number;
    reviewSites: { label: string; posted: number }[];
  } | null;
};

export type InsightInvite = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  lastReadAt: string | null;
  finishedAt: string | null;
  dnfAt?: string | null;
  dnfReason?: string | null;
  currentChapterId: string | null;
  reviewPosts?: Record<string, string> | null;
};

export type InsightChapter = { id: string; title: string; sort_order: number; word_count: number | null };

const DAY_MS = 86_400_000;
const STALLED_AFTER_DAYS = 7;
const ACTIVITY_DAYS = 30;

function utcDay(t: number) {
  return new Date(t).toISOString().slice(0, 10);
}

function dayMs(day: string) {
  return Date.parse(`${day}T00:00:00Z`);
}

function mondayOf(day: string) {
  const t = dayMs(day);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return utcDay(t - dow * DAY_MS);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One row per reader per day they opened the book. Fails quietly until the migration has run. */
export async function recordBookDay(
  admin: SupabaseClient,
  row: { phase: InsightsPhase; inviteId: string; projectId: string }
) {
  try {
    await admin
      .from("reader_book_days")
      .upsert(
        { phase: row.phase, invite_id: row.inviteId, project_id: row.projectId, day: utcDay(Date.now()) },
        { onConflict: "phase,invite_id,day", ignoreDuplicates: true }
      );
  } catch {
    // table missing before migration_reader_insights.sql
  }
}

export function computeReaderInsights(input: {
  phase: InsightsPhase;
  chapters: InsightChapter[];
  invites: InsightInvite[];
  progress: { invite_id: string; chapter_id: string; percent: number }[];
  days: { invite_id: string; day: string }[];
  comments: { invite_id: string; chapter_id: string | null }[];
  deadline?: string | null;
  reviewSites?: { key: string; label: string }[];
  now?: number;
}): ReaderInsights {
  const now = input.now ?? Date.now();
  const today = utcDay(now);
  const chapters = [...input.chapters].sort((a, b) => a.sort_order - b.sort_order);
  const chapterIndex = new Map(chapters.map((c, i) => [c.id, i]));
  const words = chapters.map((c) => Math.max(0, Number(c.word_count) || 0));
  const totalWords = words.reduce((a, b) => a + b, 0);
  const weights = totalWords > 0 ? words : chapters.map(() => 1);
  const weightTotal = weights.reduce((a, b) => a + b, 0) || 1;
  const before: number[] = [];
  let running = 0;
  for (const w of weights) {
    before.push(running);
    running += w;
  }

  const progressByInvite = new Map<string, Map<number, number>>();
  for (const p of input.progress) {
    const idx = chapterIndex.get(p.chapter_id);
    if (idx == null) continue;
    const m = progressByInvite.get(p.invite_id) || new Map<number, number>();
    m.set(idx, Math.max(m.get(idx) || 0, Number(p.percent) || 0));
    progressByInvite.set(p.invite_id, m);
  }

  const daysByInvite = new Map<string, Set<string>>();
  for (const d of input.days) {
    const s = daysByInvite.get(d.invite_id) || new Set<string>();
    s.add(String(d.day).slice(0, 10));
    daysByInvite.set(d.invite_id, s);
  }

  const commentsByInvite = new Map<string, number>();
  const commentsByChapter = new Map<number, number>();
  const readerIds = new Set(input.invites.map((i) => i.id));
  for (const c of input.comments) {
    if (!readerIds.has(c.invite_id)) continue;
    commentsByInvite.set(c.invite_id, (commentsByInvite.get(c.invite_id) || 0) + 1);
    const idx = c.chapter_id ? chapterIndex.get(c.chapter_id) : undefined;
    if (idx != null) commentsByChapter.set(idx, (commentsByChapter.get(idx) || 0) + 1);
  }

  const deadlineMs = input.deadline ? Date.parse(input.deadline) : NaN;
  const hasDeadline = Number.isFinite(deadlineMs);

  const furthestByInvite = new Map<string, number>();
  const pctByInvite = new Map<string, Map<number, number>>();
  const readers: ReaderInsightRow[] = input.invites.map((inv) => {
    const prog = progressByInvite.get(inv.id) || new Map<number, number>();
    const days = [...(daysByInvite.get(inv.id) || [])].sort();
    let furthest = -1;
    for (const [idx, pct] of prog) if (pct > 0 && idx > furthest) furthest = idx;
    if (furthest < 0 && inv.currentChapterId && chapterIndex.has(inv.currentChapterId)) {
      furthest = chapterIndex.get(inv.currentChapterId)!;
      if (!prog.has(furthest)) prog.set(furthest, 1);
    }
    const finished = Boolean(inv.finishedAt);
    if (finished && chapters.length) furthest = chapters.length - 1;
    pctByInvite.set(inv.id, prog);
    furthestByInvite.set(inv.id, furthest);

    let bookPercent = 0;
    if (finished) bookPercent = 100;
    else if (furthest >= 0) {
      const pct = Math.min(100, prog.get(furthest) || 0);
      bookPercent = Math.round(((before[furthest] + (weights[furthest] * pct) / 100) / weightTotal) * 100);
    }

    const started = furthest >= 0 || days.length > 0 || Boolean(inv.lastReadAt);
    const readingDays = days.length || (started ? 1 : 0);
    const startedAt = days[0] ? `${days[0]}T00:00:00Z` : started ? inv.lastReadAt : null;
    const avgGapDays =
      days.length >= 2 ? round1((dayMs(days[days.length - 1]) - dayMs(days[0])) / DAY_MS / (days.length - 1)) : null;

    let status: ReaderStatus;
    if (finished) status = "finished";
    else if (inv.status === "dnf") status = "dnf";
    else if (!started) status = "not_started";
    else {
      const last = inv.lastReadAt ? Date.parse(inv.lastReadAt) : days.length ? dayMs(days[days.length - 1]) : 0;
      status = now - last > STALLED_AFTER_DAYS * DAY_MS ? "stalled" : "reading";
    }

    let atRisk = false;
    if (input.phase === "arc" && hasDeadline && !finished && deadlineMs > now) {
      const joined = Date.parse(inv.createdAt);
      const window = Math.max(DAY_MS, deadlineMs - joined);
      const expected = Math.min(100, ((now - joined) / window) * 100);
      atRisk = bookPercent + 15 < expected;
    }

    return {
      id: inv.id,
      name: inv.name,
      status,
      joinedAt: inv.createdAt,
      startedAt,
      lastReadAt: inv.lastReadAt,
      finishedAt: inv.finishedAt,
      bookPercent,
      furthestChapter: furthest >= 0 ? chapters[furthest]?.title || null : null,
      readingDays,
      avgGapDays,
      comments: commentsByInvite.get(inv.id) || 0,
      atRisk,
      finishedOnTime:
        input.phase === "arc" && inv.finishedAt
          ? !hasDeadline || Date.parse(inv.finishedAt) <= deadlineMs
          : null,
      reviewsPosted: Object.keys(inv.reviewPosts || {}).length,
    };
  });

  const chapterRows: ChapterInsight[] = chapters.map((c, i) => {
    let reached = 0;
    let completed = 0;
    let stoppedHere = 0;
    for (const r of readers) {
      const furthest = furthestByInvite.get(r.id) ?? -1;
      if (furthest >= i) reached++;
      const pct = pctByInvite.get(r.id)?.get(i) || 0;
      if (r.status === "finished" || furthest > i || pct >= 90) completed++;
      if (furthest === i && (r.status === "dnf" || r.status === "stalled")) stoppedHere++;
    }
    return {
      id: c.id,
      title: c.title || `Chapter ${i + 1}`,
      words: words[i],
      reached,
      completed,
      stoppedHere,
      comments: commentsByChapter.get(i) || 0,
    };
  });
  const worst = chapterRows.reduce<ChapterInsight | null>(
    (best, c) => (c.stoppedHere > 0 && (!best || c.stoppedHere > best.stoppedHere) ? c : best),
    null
  );

  const startedReaders = readers.filter((r) => r.status !== "not_started");
  const finishedReaders = readers.filter((r) => r.status === "finished");
  const daysToFinish = finishedReaders
    .map((r) => {
      const from = Date.parse(r.startedAt || r.joinedAt);
      const to = Date.parse(r.finishedAt as string);
      return Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, (to - from) / DAY_MS) : null;
    })
    .filter((n): n is number => n != null);
  const med = median(daysToFinish);

  // Joined over time: daily for short spans, weekly beyond two months
  const joinedDays = readers.map((r) => utcDay(Date.parse(r.joinedAt))).sort();
  let joinedBucket: "day" | "week" = "day";
  const joined: { start: string; count: number }[] = [];
  if (joinedDays.length) {
    const spanDays = (dayMs(today) - dayMs(joinedDays[0])) / DAY_MS;
    joinedBucket = spanDays > 60 ? "week" : "day";
    const step = joinedBucket === "week" ? 7 * DAY_MS : DAY_MS;
    const keyOf = (d: string) => (joinedBucket === "week" ? mondayOf(d) : d);
    const counts = new Map<string, number>();
    for (const d of joinedDays) counts.set(keyOf(d), (counts.get(keyOf(d)) || 0) + 1);
    const startMs = dayMs(keyOf(joinedDays[0]));
    const endMs = dayMs(keyOf(today));
    const firstMs = Math.max(startMs, endMs - 103 * step);
    for (let t = firstMs; t <= endMs; t += step) joined.push({ start: utcDay(t), count: counts.get(utcDay(t)) || 0 });
  }

  const activityCounts = new Map<string, number>();
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  let earliestDay: string | null = null;
  for (const r of readers) {
    for (const d of daysByInvite.get(r.id) || []) {
      activityCounts.set(d, (activityCounts.get(d) || 0) + 1);
      weekdays[(new Date(dayMs(d)).getUTCDay() + 6) % 7]++;
      if (!earliestDay || d < earliestDay) earliestDay = d;
    }
  }
  const activity: { day: string; readers: number }[] = [];
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
    const d = utcDay(dayMs(today) - i * DAY_MS);
    activity.push({ day: d, readers: activityCounts.get(d) || 0 });
  }
  const active7 = readers.filter((r) =>
    [...(daysByInvite.get(r.id) || [])].some((d) => dayMs(today) - dayMs(d) < 7 * DAY_MS)
  ).length;

  const buckets: [string, number, number][] = [
    ["1 day", 1, 1],
    ["2–3 days", 2, 3],
    ["4–7 days", 4, 7],
    ["8–14 days", 8, 14],
    ["15+ days", 15, Infinity],
  ];
  const returns = buckets.map(([label, lo, hi]) => ({
    label,
    readers: startedReaders.filter((r) => r.readingDays >= lo && r.readingDays <= hi).length,
  }));

  const dnfReasons = input.invites
    .filter((i) => i.status === "dnf" && !i.finishedAt)
    .map((i) => ({
      name: i.name,
      chapter: readers.find((r) => r.id === i.id)?.furthestChapter || null,
      reason: String(i.dnfReason || "").trim(),
      at: i.dnfAt || null,
    }));

  let arc: ReaderInsights["arc"] = null;
  if (input.phase === "arc") {
    arc = {
      deadline: input.deadline || null,
      daysLeft: hasDeadline ? Math.ceil((deadlineMs - now) / DAY_MS) : null,
      finishedOnTime: readers.filter((r) => r.finishedOnTime === true).length,
      finishedLate: readers.filter((r) => r.finishedOnTime === false).length,
      missedDeadline: hasDeadline && deadlineMs <= now ? readers.filter((r) => !r.finishedAt).length : 0,
      atRisk: readers.filter((r) => r.atRisk).length,
      finishedNoReview: readers.filter((r) => r.finishedAt && r.reviewsPosted === 0).length,
      reviewSites: (input.reviewSites || []).map((s) => ({
        label: s.label,
        posted: input.invites.filter((i) => i.reviewPosts?.[s.key]).length,
      })),
    };
  }

  return {
    phase: input.phase,
    chapterCount: chapters.length,
    totalWords,
    trackedSince: earliestDay,
    summary: {
      readers: readers.length,
      started: startedReaders.length,
      finished: finishedReaders.length,
      dnf: readers.filter((r) => r.status === "dnf").length,
      stalled: readers.filter((r) => r.status === "stalled").length,
      active7,
      completionRate: startedReaders.length ? finishedReaders.length / startedReaders.length : null,
      avgBookPercent: startedReaders.length
        ? Math.round(startedReaders.reduce((a, r) => a + r.bookPercent, 0) / startedReaders.length)
        : 0,
      avgReadingDays: startedReaders.length
        ? round1(startedReaders.reduce((a, r) => a + r.readingDays, 0) / startedReaders.length)
        : null,
      medianDaysToFinish: med == null ? null : round1(med),
      comments: readers.reduce((a, r) => a + r.comments, 0),
    },
    joinedBucket,
    joined,
    activity,
    weekdays,
    returns,
    chapters: chapterRows,
    biggestDrop: worst ? { title: worst.title, stopped: worst.stoppedHere } : null,
    readers: readers.sort((a, b) => b.bookPercent - a.bookPercent || a.name.localeCompare(b.name)),
    dnfReasons,
    arc,
  };
}

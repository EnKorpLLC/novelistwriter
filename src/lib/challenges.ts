import "server-only";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorsWithPublicSites } from "@/lib/credits";
import { authorPath } from "@/lib/handles";
import { dayInTimeZone, isValidDayString, isValidTimeZone } from "@/lib/local-day";

/** Same rate the writing record uses: about 5.5 characters per word, counting the space */
export const CHARS_PER_WORD = 5.5;
/** A day counts toward a streak once this many verified words are written */
export const STREAK_MIN_WORDS = 50;
export const MAX_GROUP_CHALLENGES = 5;
const REFRESH_AFTER_MS = 2 * 60 * 1000;

export type Challenge = {
  id: string;
  slug: string;
  title: string;
  description: string;
  goal_words: number;
  starts_on: string;
  ends_on: string;
  kind: "platform" | "group";
  created_by: string | null;
  is_public: boolean;
  join_code: string | null;
};

export type Participant = {
  challenge_id: string;
  user_id: string;
  time_zone: string;
  joined_at: string;
  verified_words: number;
  days_written: number;
  current_streak: number;
  best_streak: number;
  daily: Record<string, number>;
  completed_at: string | null;
  show_on_leaderboard: boolean;
  last_computed_at: string | null;
};

export type ChallengeStatus = "upcoming" | "active" | "ended";

export function challengeStatus(c: Pick<Challenge, "starts_on" | "ends_on">, today = dayInTimeZone("UTC")): ChallengeStatus {
  if (today < c.starts_on) return "upcoming";
  if (today > c.ends_on) return "ended";
  return "active";
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function slugifyChallenge(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "challenge"
  );
}

export function newJoinCode(): string {
  return randomBytes(5).toString("hex");
}

/** Validates the fields an admin or author sets on a challenge. */
export function parseChallengeInput(body: Record<string, unknown>): { ok: true; value: Partial<Challenge> } | { ok: false; error: string } {
  const value: Partial<Challenge> = {};
  if ("title" in body) {
    const title = String(body.title || "").trim().slice(0, 120);
    if (!title) return { ok: false, error: "Give the challenge a name." };
    value.title = title;
  }
  if ("description" in body) value.description = String(body.description || "").trim().slice(0, 2000);
  if ("goal_words" in body) {
    const goal = Math.round(Number(body.goal_words));
    if (!Number.isFinite(goal) || goal < 100 || goal > 1_000_000) return { ok: false, error: "Set a word goal between 100 and 1,000,000." };
    value.goal_words = goal;
  }
  for (const key of ["starts_on", "ends_on"] as const) {
    if (key in body) {
      const day = String(body[key] || "");
      if (!isValidDayString(day)) return { ok: false, error: "Pick a start and an end date." };
      value[key] = day;
    }
  }
  if (value.starts_on && value.ends_on) {
    if (value.ends_on < value.starts_on) return { ok: false, error: "The end date has to be on or after the start date." };
    if (daysBetween(value.starts_on, value.ends_on).length > 366) return { ok: false, error: "Challenges can run for up to a year." };
  }
  if ("is_public" in body) value.is_public = body.is_public !== false;
  return { ok: true, value };
}

/**
 * Verified words for one participant. Each day counts the smaller of the words their books grew by
 * and the words they typed in the editor, so pasted, imported, and typed-then-deleted text never counts.
 */
/**
 * Verified words per local day between two dates: the smaller of the words a writer's books grew by and the
 * words they typed in the editor, so pasted, imported, and typed-then-deleted text never counts.
 */
export async function verifiedWordsByDay(admin: SupabaseClient, userId: string, timeZone: string, fromDay: string, toDay: string): Promise<Map<string, number>> {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  // Sessions are stored in UTC; widen the window by a day on each side, then bucket by the writer's local day
  const from = new Date(`${fromDay}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${toDay}T23:59:59Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  const [{ data: sessions }, { data: writingDays }] = await Promise.all([
    admin
      .from("writing_sessions")
      .select("started_at, typed_chars")
      .eq("user_id", userId)
      .eq("flagged", false)
      .gte("started_at", from.toISOString())
      .lte("started_at", to.toISOString())
      .limit(5000),
    admin.from("writing_days").select("day, words_written").eq("user_id", userId).gte("day", fromDay).lte("day", toDay),
  ]);
  const typedByDay = new Map<string, number>();
  for (const s of sessions || []) {
    const day = dayInTimeZone(tz, new Date(s.started_at));
    typedByDay.set(day, (typedByDay.get(day) || 0) + (s.typed_chars || 0));
  }
  const out = new Map<string, number>();
  for (const d of writingDays || []) {
    const day = String(d.day);
    const words = Math.max(0, Math.min(d.words_written || 0, Math.floor((typedByDay.get(day) || 0) / CHARS_PER_WORD)));
    if (words > 0) out.set(day, words);
  }
  return out;
}

export async function computeProgress(admin: SupabaseClient, challenge: Challenge, p: Pick<Participant, "user_id" | "time_zone">) {
  const tz = isValidTimeZone(p.time_zone) ? p.time_zone : "UTC";
  const today = dayInTimeZone(tz);
  const lastDay = today < challenge.ends_on ? today : challenge.ends_on;
  const days = challenge.starts_on <= lastDay ? daysBetween(challenge.starts_on, lastDay) : [];
  const daily: Record<string, number> = {};
  if (!days.length) return { verified: 0, daily, daysWritten: 0, currentStreak: 0, bestStreak: 0 };
  const byDay = await verifiedWordsByDay(admin, p.user_id, tz, challenge.starts_on, lastDay);

  let verified = 0;
  let daysWritten = 0;
  let run = 0;
  let bestStreak = 0;
  for (const day of days) {
    const words = byDay.get(day) || 0;
    if (words > 0) daily[day] = words;
    verified += words;
    if (words >= STREAK_MIN_WORDS) {
      daysWritten += 1;
      run += 1;
      bestStreak = Math.max(bestStreak, run);
    } else if (day !== today) {
      run = 0;
    }
  }
  // Today isn't over, so a streak that ran through yesterday is still alive
  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const words = daily[days[i]] || 0;
    if (words >= STREAK_MIN_WORDS) currentStreak += 1;
    else if (days[i] === today) continue;
    else break;
  }
  return { verified, daily, daysWritten, currentStreak, bestStreak };
}

/** Recomputes and saves a participant's numbers, at most every couple of minutes unless forced. */
export async function refreshParticipant(admin: SupabaseClient, challenge: Challenge, p: Participant, force = false): Promise<Participant> {
  if (!force && p.last_computed_at) {
    const last = Date.parse(p.last_computed_at);
    if (Date.now() - last < REFRESH_AFTER_MS) return p;
    // Numbers are final once computed well after the last day ended everywhere
    if (last - Date.parse(`${challenge.ends_on}T23:59:59Z`) > 36 * 3600 * 1000) return p;
  }
  const r = await computeProgress(admin, challenge, p);
  const next: Participant = {
    ...p,
    verified_words: r.verified,
    days_written: r.daysWritten,
    current_streak: r.currentStreak,
    best_streak: Math.max(r.bestStreak, p.best_streak || 0),
    daily: r.daily,
    completed_at: p.completed_at || (r.verified >= challenge.goal_words ? new Date().toISOString() : null),
    last_computed_at: new Date().toISOString(),
  };
  await admin
    .from("challenge_participants")
    .update({
      verified_words: next.verified_words,
      days_written: next.days_written,
      current_streak: next.current_streak,
      best_streak: next.best_streak,
      daily: next.daily,
      completed_at: next.completed_at,
      last_computed_at: next.last_computed_at,
    })
    .eq("challenge_id", challenge.id)
    .eq("user_id", p.user_id);
  return next;
}

export type LeaderRow = {
  userId: string;
  name: string;
  href: string | null;
  verifiedWords: number;
  daysWritten: number;
  currentStreak: number;
  completed: boolean;
};

export async function leaderboard(admin: SupabaseClient, challenge: Challenge, limit = 50): Promise<{ rows: LeaderRow[]; participants: number; totalWords: number }> {
  const [{ data: top }, { count }, { data: totals }] = await Promise.all([
    admin
      .from("challenge_participants")
      .select("user_id, verified_words, days_written, current_streak, completed_at")
      .eq("challenge_id", challenge.id)
      .eq("show_on_leaderboard", true)
      .order("verified_words", { ascending: false })
      .limit(limit),
    admin.from("challenge_participants").select("user_id", { count: "exact", head: true }).eq("challenge_id", challenge.id),
    admin.from("challenge_participants").select("verified_words").eq("challenge_id", challenge.id).limit(20000),
  ]);
  const ids = (top || []).map((r) => r.user_id);
  const [{ data: profiles }, publicSites] = await Promise.all([
    ids.length ? admin.from("profiles").select("id, display_name, handle").in("id", ids) : Promise.resolve({ data: [] as { id: string; display_name: string | null; handle: string | null }[] }),
    authorsWithPublicSites(ids),
  ]);
  const byId = new Map((profiles || []).map((p) => [p.id, p]));
  return {
    participants: count || 0,
    totalWords: (totals || []).reduce((n, r) => n + (r.verified_words || 0), 0),
    rows: (top || []).map((r) => {
      const prof = byId.get(r.user_id);
      return {
        userId: r.user_id,
        name: prof?.display_name || "A writer",
        href: prof?.handle && publicSites.has(r.user_id) ? authorPath(prof.handle) : null,
        verifiedWords: r.verified_words,
        daysWritten: r.days_written,
        currentStreak: r.current_streak,
        completed: Boolean(r.completed_at),
      };
    }),
  };
}

/** Challenges a writer finished, newest first, for badges. */
export async function challengeWins(admin: SupabaseClient, userId: string): Promise<{ slug: string; title: string; goal: number; endsOn: string; isPublic: boolean }[]> {
  const { data: rows } = await admin
    .from("challenge_participants")
    .select("challenge_id, completed_at")
    .eq("user_id", userId)
    .not("completed_at", "is", null);
  const ids = (rows || []).map((r) => r.challenge_id);
  if (!ids.length) return [];
  const { data: challenges } = await admin.from("challenges").select("slug, title, goal_words, ends_on, is_public").in("id", ids).order("ends_on", { ascending: false });
  return (challenges || []).map((c) => ({ slug: c.slug, title: c.title, goal: c.goal_words, endsOn: c.ends_on, isPublic: c.is_public }));
}

/** Refreshes everyone in challenges running now or that just ended. Called by the daily job. */
export async function refreshActiveChallenges(admin: SupabaseClient, maxParticipants = 600): Promise<number> {
  const today = dayInTimeZone("UTC");
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 2);
  const { data: challenges } = await admin
    .from("challenges")
    .select("*")
    .lte("starts_on", today)
    .gte("ends_on", yesterday.toISOString().slice(0, 10));
  let done = 0;
  for (const c of (challenges || []) as Challenge[]) {
    const { data: people } = await admin
      .from("challenge_participants")
      .select("*")
      .eq("challenge_id", c.id)
      .order("last_computed_at", { ascending: true, nullsFirst: true })
      .limit(maxParticipants - done);
    for (const p of (people || []) as Participant[]) {
      await refreshParticipant(admin, c, p, true);
      done += 1;
      if (done >= maxParticipants) return done;
    }
  }
  return done;
}

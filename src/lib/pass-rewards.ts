import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { grantPassDays } from "@/lib/studio-pass";
import { REFERRAL_COOKIE, isValidReferralCode } from "@/lib/referral-shared";

const VISITORS_PER_DAY_REWARD = 20;
const MAX_JOIN_DAYS_PER_DAY = 3;
const MAX_DAYS_PER_READER = 8;
/** About 1,000 words of typing */
const AUTHOR_SIGNUP_TYPED_CHARS = 6000;
const REGULAR_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Whoever's share link this visitor arrived through in the last 30 days. */
export async function referrerFromCookie(admin: SupabaseClient): Promise<string | null> {
  const code = ((await cookies()).get(REFERRAL_COOKIE)?.value || "").trim().toUpperCase();
  if (!isValidReferralCode(code)) return null;
  const { data } = await admin.from("profiles").select("id").eq("referral_code", code).maybeSingle();
  return data?.id || null;
}

/** 1 day once 20 unique visitors arrive through your link in a day (at most 1 day per day). */
export async function rewardVisitsToday(admin: SupabaseClient, referrerId: string) {
  const day = today();
  const { count } = await admin
    .from("share_visits")
    .select("id", { count: "exact", head: true })
    .eq("referrer_user_id", referrerId)
    .eq("day", day);
  if ((count || 0) < VISITORS_PER_DAY_REWARD) return;
  await grantPassDays(admin, {
    userId: referrerId,
    days: 1,
    reason: "visits",
    refKey: `visits:${referrerId}:${day}`,
    notify: `${VISITORS_PER_DAY_REWARD} people visited through your link today.`,
  });
}

/** Days a referrer has already earned from one reader, across every reward type. */
async function daysEarnedFromReader(admin: SupabaseClient, referrerId: string, readerId: string) {
  const { data } = await admin
    .from("studio_pass_ledger")
    .select("credited_days")
    .eq("user_id", referrerId)
    .eq("meta->>readerId", readerId);
  return (data || []).reduce((n, r) => n + (r.credited_days || 0), 0);
}

async function grantForReader(
  admin: SupabaseClient,
  opts: { referrerId: string; readerId: string; days: number; reason: string; refKey: string; notify: string; meta?: Record<string, unknown> }
) {
  const room = MAX_DAYS_PER_READER - (await daysEarnedFromReader(admin, opts.referrerId, opts.readerId));
  if (room <= 0) return 0;
  return grantPassDays(admin, {
    userId: opts.referrerId,
    days: Math.min(opts.days, room),
    reason: opts.reason,
    refKey: opts.refKey,
    meta: { ...(opts.meta || {}), readerId: opts.readerId },
    notify: opts.notify,
  });
}

/** A reader who came through your link opened a beta or ARC manuscript: 1 day, once per reader per book. */
export async function rewardReaderJoin(
  admin: SupabaseClient,
  opts: { readerId: string; projectId: string; kind: "beta" | "arc" }
) {
  try {
    const referrerId = await referrerFromCookie(admin);
    if (!referrerId || referrerId === opts.readerId) return;
    const startOfDay = `${today()}T00:00:00.000Z`;
    const { count } = await admin
      .from("studio_pass_ledger")
      .select("id", { count: "exact", head: true })
      .eq("user_id", referrerId)
      .eq("reason", "reader_join")
      .gte("created_at", startOfDay);
    if ((count || 0) >= MAX_JOIN_DAYS_PER_DAY) return;
    await grantForReader(admin, {
      referrerId,
      readerId: opts.readerId,
      days: 1,
      reason: "reader_join",
      refKey: `join:${opts.readerId}:${opts.projectId}`,
      meta: { projectId: opts.projectId, kind: opts.kind },
      notify: "A reader you sent opened a manuscript.",
    });
  } catch {
    /* rewards never block reading */
  }
}

/** Record a reading day; readers you brought earn you days as they become regulars. */
export async function recordReadingDay(admin: SupabaseClient, readerId: string) {
  try {
    await admin
      .from("reader_activity_days")
      .upsert({ user_id: readerId, day: today() }, { onConflict: "user_id,day", ignoreDuplicates: true });
    const { data: reader } = await admin
      .from("profiles")
      .select("referred_by, created_at")
      .eq("id", readerId)
      .maybeSingle();
    if (!reader?.referred_by) return;
    const { data: days } = await admin.from("reader_activity_days").select("day").eq("user_id", readerId);
    const all = (days || []).map((d) => d.day as string);
    const joined = reader.created_at ? Date.parse(reader.created_at) : Date.now();
    const early = all.filter((d) => Date.parse(`${d}T00:00:00Z`) - joined <= REGULAR_WINDOW_MS).length;
    if (early >= 5) {
      await grantForReader(admin, {
        referrerId: reader.referred_by,
        readerId,
        days: 2,
        reason: "reader_regular",
        refKey: `regular5:${readerId}`,
        notify: "A reader you brought is now a regular (5 reading days).",
      });
    }
    if (all.length >= 15) {
      await grantForReader(admin, {
        referrerId: reader.referred_by,
        readerId,
        days: 3,
        reason: "reader_regular",
        refKey: `regular15:${readerId}`,
        notify: "A reader you brought hit 15 reading days.",
      });
    }
  } catch {
    /* rewards never block reading */
  }
}

/** A reader you brought was accepted as a beta or ARC reader on someone else's book: 2 days, once. */
export async function rewardAcceptedElsewhere(
  admin: SupabaseClient,
  opts: { readerUserId?: string | null; readerEmail: string; bookAuthorId: string }
) {
  try {
    const email = opts.readerEmail.trim().toLowerCase();
    const { data: reader } = opts.readerUserId
      ? await admin.from("profiles").select("id, referred_by").eq("id", opts.readerUserId).maybeSingle()
      : await admin.from("profiles").select("id, referred_by").ilike("email", email).maybeSingle();
    if (!reader?.referred_by || reader.referred_by === opts.bookAuthorId || reader.referred_by === reader.id) return;
    await grantForReader(admin, {
      referrerId: reader.referred_by,
      readerId: reader.id,
      days: 2,
      reason: "reader_accepted_elsewhere",
      refKey: `accepted:${reader.id}`,
      notify: "A reader you brought was accepted on another author's book.",
    });
  } catch {
    /* non-fatal */
  }
}

/** An author who signed up through your link typed their first ~1,000 words: 7 days, once. */
export async function rewardAuthorSignup(admin: SupabaseClient, authorId: string) {
  try {
    const { data: author } = await admin
      .from("profiles")
      .select("referred_by")
      .eq("id", authorId)
      .maybeSingle();
    if (!author?.referred_by || author.referred_by === authorId) return;
    const refKey = `signup:${authorId}`;
    const { data: prior } = await admin.from("studio_pass_ledger").select("id").eq("ref_key", refKey).maybeSingle();
    if (prior) return;
    const { data: sessions } = await admin
      .from("writing_sessions")
      .select("typed_chars")
      .eq("user_id", authorId)
      .eq("flagged", false);
    const typed = (sessions || []).reduce((n, s) => n + (s.typed_chars || 0), 0);
    if (typed < AUTHOR_SIGNUP_TYPED_CHARS) return;
    await grantPassDays(admin, {
      userId: author.referred_by,
      days: 7,
      reason: "author_signup",
      refKey,
      meta: { authorId },
      notify: "An author you invited wrote their first 1,000 words.",
    });
  } catch {
    /* non-fatal */
  }
}

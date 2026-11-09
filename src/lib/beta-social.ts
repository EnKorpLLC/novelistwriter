import type { SupabaseClient } from "@supabase/supabase-js";

export type ReaderStats = {
  finished: number;
  dnf: number;
  reading: number;
};

type InviteStatRow = {
  status: string;
  finished_at?: string | null;
};

/** Aggregate platform reading stats from invite rows (one row per book ideally). */
export function computeReaderStats(invites: InviteStatRow[]): ReaderStats {
  let finished = 0;
  let dnf = 0;
  let reading = 0;
  for (const i of invites) {
    if (i.finished_at) {
      finished += 1;
      continue;
    }
    if (i.status === "dnf") {
      dnf += 1;
      continue;
    }
    if (i.status === "pending" || i.status === "accepted") {
      reading += 1;
    }
  }
  return { finished, dnf, reading };
}

export type NotificationType =
  | "reader_review"
  | "message"
  | "author_new_book"
  | "author_rerelease"
  | "application_update"
  | "reading_reminder"
  | "author_new_arc"
  | "arc_invite"
  | "arc_deadline"
  | "studio_pass"
  | "book_released"
  | "arc_review_push"
  | "launch_team"
  | "author_thanks"
  | "reader_milestone";

export async function createNotification(
  admin: SupabaseClient,
  opts: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string | null;
    href?: string | null;
    meta?: Record<string, unknown>;
  }
) {
  if (!opts.userId) return;
  await admin.from("beta_notifications").insert({
    user_id: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body || null,
    href: opts.href || null,
    meta: opts.meta || {},
  });
}

export type ReaderBadgeId = "finisher" | "on_time" | "feedback" | "reviewer" | "top_rated" | "launch_day" | "launch_team";

export type ReaderBadge = { id: ReaderBadgeId; label: string; detail: string };

export type ReaderBadgeStats = {
  booksFinished: number;
  arcsOnTime: number;
  comments: number;
  thanks: number;
  reviewsPosted: number;
  avgRating: number | null;
  ratingCount: number;
  /** Reviews posted within 7 days of a book's release */
  launchWeekReviews: number;
  /** Launch teams joined where the reader did at least one task */
  launchTeams: number;
};

/** What each badge takes. Shared with the reader dashboard's progress hints. */
export const READER_BADGE_RULES = {
  finisherTiers: [10, 5, 1],
  onTime: 1,
  feedbackComments: 20,
  feedbackThanks: 3,
  reviewerTiers: [5, 1],
  topRatedAvg: 4.5,
  topRatedMinRatings: 3,
} as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function readerBadgesFromStats(s: ReaderBadgeStats): ReaderBadge[] {
  const r = READER_BADGE_RULES;
  const out: ReaderBadge[] = [];
  const finisherTier = r.finisherTiers.find((t) => s.booksFinished >= t);
  if (finisherTier) {
    out.push({
      id: "finisher",
      label: finisherTier > 1 ? `Finisher ${finisherTier}+` : "Finisher",
      detail: `Finished ${plural(s.booksFinished, "beta or ARC book")}`,
    });
  }
  if (s.arcsOnTime >= r.onTime) {
    out.push({ id: "on_time", label: "On time", detail: `${plural(s.arcsOnTime, "ARC")} finished before the deadline` });
  }
  if (s.comments >= r.feedbackComments || s.thanks >= r.feedbackThanks) {
    out.push({
      id: "feedback",
      label: "Thoughtful feedback",
      detail: `${plural(s.comments, "comment")} · ${plural(s.thanks, "thank-you", "thank-yous")} from authors`,
    });
  }
  const reviewerTier = r.reviewerTiers.find((t) => s.reviewsPosted >= t);
  if (reviewerTier) {
    out.push({
      id: "reviewer",
      label: reviewerTier > 1 ? `Reviewer ${reviewerTier}+` : "Reviewer",
      detail: `${plural(s.reviewsPosted, "review")} posted on review sites`,
    });
  }
  if (s.ratingCount >= r.topRatedMinRatings && s.avgRating != null && s.avgRating >= r.topRatedAvg) {
    out.push({
      id: "top_rated",
      label: "Top rated",
      detail: `${s.avgRating.toFixed(1)} average from ${plural(s.ratingCount, "author rating")}`,
    });
  }
  if (s.launchWeekReviews >= 1) {
    out.push({ id: "launch_day", label: "Launch day", detail: `${plural(s.launchWeekReviews, "review")} posted in a book's first week` });
  }
  if (s.launchTeams >= 1) {
    out.push({ id: "launch_team", label: "Launch team", detail: `Helped launch ${plural(s.launchTeams, "book")}` });
  }
  return out;
}

const EMPTY_STATS: ReaderBadgeStats = {
  booksFinished: 0,
  arcsOnTime: 0,
  comments: 0,
  thanks: 0,
  reviewsPosted: 0,
  avgRating: null,
  ratingCount: 0,
  launchWeekReviews: 0,
  launchTeams: 0,
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const THANKS_EMOJIS = ["thanks", "heart"];

/**
 * Badge stats for many readers at once. Key is the reader's user id when known, otherwise their email.
 * Activity under either identity counts toward the same reader.
 */
export async function readerBadgeStatsFor(
  admin: SupabaseClient,
  readers: { userId?: string | null; email?: string | null }[]
): Promise<Map<string, { stats: ReaderBadgeStats; badges: ReaderBadge[] }>> {
  const out = new Map<string, { stats: ReaderBadgeStats; badges: ReaderBadge[] }>();
  const idents = readers
    .map((r) => ({ userId: r.userId || null, email: String(r.email || "").trim().toLowerCase() || null }))
    .filter((r) => r.userId || r.email);
  if (!idents.length) return out;
  const userIds = [...new Set(idents.map((r) => r.userId).filter(Boolean))] as string[];
  const emails = [...new Set(idents.map((r) => r.email).filter((e) => e?.includes("@")))] as string[];
  if (!userIds.length && !emails.length) return out;
  const keyOf = (r: { userId: string | null; email: string | null }) => r.userId || r.email!;
  const byUser = new Map(idents.filter((r) => r.userId).map((r) => [r.userId!, keyOf(r)]));
  const byEmail = new Map(idents.filter((r) => r.email).map((r) => [r.email!, keyOf(r)]));
  const ownerOf = (userId?: string | null, email?: string | null) =>
    (userId && byUser.get(userId)) || (email && byEmail.get(String(email).trim().toLowerCase())) || null;

  const orFilter = (userCol: string, emailCol: string) =>
    [
      userIds.length ? `${userCol}.in.(${userIds.join(",")})` : "",
      emails.length ? `${emailCol}.in.(${emails.map((e) => `"${e.replace(/"/g, "")}"`).join(",")})` : "",
    ]
      .filter(Boolean)
      .join(",");

  const [{ data: betaRows }, { data: arcRows }, { data: ratingRows }, { data: commentRows }] = await Promise.all([
    admin.from("beta_invites").select("project_id, reader_user_id, email, finished_at").or(orFilter("reader_user_id", "email")),
    admin
      .from("arc_invites")
      .select("project_id, reader_user_id, email, finished_at, review_posts")
      .or(orFilter("reader_user_id", "email")),
    admin.from("beta_reader_reviews").select("reader_user_id, reader_email, rating").or(orFilter("reader_user_id", "reader_email")),
    userIds.length
      ? admin
          .from("beta_comments")
          .select("id, project_id, reader_user_id")
          .in("reader_user_id", userIds)
          .is("author_user_id", null)
          .order("created_at", { ascending: true })
          .limit(5000)
      : Promise.resolve({ data: [] as { id: string; project_id: string; reader_user_id: string }[] }),
  ]);

  const stats = new Map<string, ReaderBadgeStats & { finishedProjects: Set<string> }>();
  const get = (key: string) => {
    let s = stats.get(key);
    if (!s) {
      s = { ...EMPTY_STATS, finishedProjects: new Set<string>() };
      stats.set(key, s);
    }
    return s;
  };

  for (const row of betaRows || []) {
    const key = ownerOf(row.reader_user_id, row.email);
    if (key && row.finished_at) get(key).finishedProjects.add(`beta:${row.project_id}`);
  }

  const arcProjectIds = [
    ...new Set(
      (arcRows || [])
        .filter((r) => r.finished_at || Object.keys((r.review_posts as Record<string, string>) || {}).length)
        .map((r) => r.project_id)
    ),
  ];
  const { data: arcProjects } = arcProjectIds.length
    ? await admin.from("projects").select("id, arc_deadline, release_date, published_at").in("id", arcProjectIds)
    : { data: [] as { id: string; arc_deadline: string | null; release_date: string | null; published_at: string | null }[] };
  const deadlineById = new Map((arcProjects || []).map((p) => [p.id, p.arc_deadline as string | null]));
  const releaseById = new Map(
    (arcProjects || []).map((p) => [p.id, p.release_date ? Date.parse(`${p.release_date}T00:00:00Z`) : p.published_at ? Date.parse(p.published_at) : null])
  );
  for (const row of arcRows || []) {
    const key = ownerOf(row.reader_user_id, row.email);
    if (!key) continue;
    const s = get(key);
    const posts = (row.review_posts as Record<string, string>) || {};
    s.reviewsPosted += Object.keys(posts).length;
    const release = releaseById.get(row.project_id);
    if (release != null) {
      const inLaunchWeek = Object.values(posts).some((at) => {
        const t = Date.parse(at);
        return Number.isFinite(t) && t >= release - 24 * 60 * 60 * 1000 && t <= release + WEEK_MS;
      });
      if (inLaunchWeek) s.launchWeekReviews += 1;
    }
    if (!row.finished_at) continue;
    s.finishedProjects.add(`arc:${row.project_id}`);
    const deadline = deadlineById.get(row.project_id);
    if (deadline && Date.parse(row.finished_at) <= Date.parse(deadline)) s.arcsOnTime += 1;
  }

  const ratings = new Map<string, number[]>();
  for (const row of ratingRows || []) {
    const key = ownerOf(row.reader_user_id, row.reader_email);
    if (!key || row.rating == null) continue;
    ratings.set(key, [...(ratings.get(key) || []), Number(row.rating)]);
  }
  for (const [key, list] of ratings) {
    const s = get(key);
    s.ratingCount = list.length;
    s.avgRating = Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
  }

  const comments = commentRows || [];
  for (const c of comments) {
    const key = ownerOf(c.reader_user_id);
    if (key) get(key).comments += 1;
  }
  if (comments.length) {
    const projectIds = [...new Set(comments.map((c) => c.project_id))];
    const [{ data: owners }, { data: reactions }] = await Promise.all([
      admin.from("projects").select("id, user_id").in("id", projectIds),
      admin
        .from("beta_comment_reactions")
        .select("comment_id, user_id, emoji")
        // Most recent comments only, to keep the request URL short
        .in("comment_id", comments.map((c) => c.id).slice(-300))
        .in("emoji", THANKS_EMOJIS),
    ]);
    const authorOf = new Map((owners || []).map((p) => [p.id, p.user_id as string]));
    const commentById = new Map(comments.map((c) => [c.id, c]));
    for (const r of reactions || []) {
      const c = commentById.get(r.comment_id);
      // Only the book's author thanking the reader counts
      if (!c || authorOf.get(c.project_id) !== r.user_id) continue;
      const key = ownerOf(c.reader_user_id);
      if (key) get(key).thanks += 1;
    }
  }

  if (userIds.length) {
    const { data: teams } = await admin.from("launch_team").select("user_id, tasks").in("user_id", userIds);
    for (const t of teams || []) {
      const key = ownerOf(t.user_id);
      if (key && t.tasks && Object.keys(t.tasks).length > 0) get(key).launchTeams += 1;
    }
  }

  for (const r of idents) {
    const key = keyOf(r);
    const s = stats.get(key);
    const { finishedProjects, ...rest } = s || { ...EMPTY_STATS, finishedProjects: new Set<string>() };
    const final: ReaderBadgeStats = { ...rest, booksFinished: finishedProjects.size };
    out.set(key, { stats: final, badges: readerBadgesFromStats(final) });
  }
  return out;
}

/** /r/<handle> for readers who made their reader profile public. Empty before migration_reader_profile.sql. */
export async function publicReaderProfileUrls(admin: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const { data, error } = await admin
    .from("profiles")
    .select("id, handle, reader_profile_public")
    .in("id", ids)
    .eq("reader_profile_public", true);
  if (error) return new Map();
  return new Map((data || []).filter((p) => p.handle).map((p) => [p.id, `/r/${p.handle}`]));
}

/** Load invites for a reader identity and compute stats. */
export async function fetchReaderStatsForIdentity(
  admin: SupabaseClient,
  opts: { userId?: string | null; email?: string | null }
): Promise<ReaderStats> {
  const email = String(opts.email || "")
    .trim()
    .toLowerCase();
  const rows: InviteStatRow[] = [];
  const seen = new Set<string>();

  if (opts.userId) {
    const { data } = await admin
      .from("beta_invites")
      .select("id, project_id, status, finished_at")
      .eq("reader_user_id", opts.userId);
    for (const r of data || []) {
      if (seen.has(r.project_id)) continue;
      seen.add(r.project_id);
      rows.push(r);
    }
  }
  if (email.includes("@")) {
    const { data } = await admin
      .from("beta_invites")
      .select("id, project_id, status, finished_at")
      .ilike("email", email);
    for (const r of data || []) {
      if (seen.has(r.project_id)) continue;
      seen.add(r.project_id);
      rows.push(r);
    }
  }
  return computeReaderStats(rows);
}

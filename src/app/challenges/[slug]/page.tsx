import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { PublicHeader } from "@/components/PublicHeader";
import { ChallengeActions } from "@/components/ChallengeActions";
import { ShareKit } from "@/components/ShareKit";
import { appUrl } from "@/lib/stripe";
import { dayInTimeZone, isValidTimeZone } from "@/lib/local-day";
import { STREAK_MIN_WORDS, challengeStatus, daysBetween, leaderboard, refreshParticipant, type Challenge, type Participant } from "@/lib/challenges";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ code?: string }> };

async function load(slug: string) {
  const admin = createServiceClient();
  const { data } = await admin.from("challenges").select("*").eq("slug", slug).maybeSingle();
  return { admin, challenge: data as Challenge | null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { challenge } = await load(slug);
  if (!challenge) return {};
  const description = `${challenge.goal_words.toLocaleString()} verified words, ${fmt(challenge.starts_on)} to ${fmt(challenge.ends_on)}. Only words typed in the editor count.`;
  return {
    title: `${challenge.title} — Novelist Writer writing challenge`,
    description,
    alternates: { canonical: `/challenges/${slug}` },
    robots: challenge.is_public ? undefined : { index: false },
    openGraph: { title: challenge.title, description, images: challenge.is_public ? [`/challenges/${slug}/card`] : [] },
  };
}

function fmt(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function ChallengePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { code } = await searchParams;
  const { admin, challenge } = await load(slug);
  if (!challenge) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: mine } = user
    ? await admin.from("challenge_participants").select("*").eq("challenge_id", challenge.id).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const isCreator = Boolean(user && challenge.created_by === user.id && challenge.kind === "group");
  if (!challenge.is_public && !mine && !isCreator && code !== challenge.join_code) notFound();

  const progress = mine ? await refreshParticipant(admin, challenge, mine as Participant) : null;
  const board = await leaderboard(admin, challenge);
  const status = challengeStatus(challenge);
  const path = `/challenges/${slug}`;

  const tz = progress && isValidTimeZone(progress.time_zone) ? progress.time_zone : "UTC";
  const today = dayInTimeZone(tz);
  const allDays = daysBetween(challenge.starts_on, challenge.ends_on);
  const shownDays = allDays.filter((d) => d <= today);
  const daysLeft = allDays.filter((d) => d >= today).length;
  const pct = progress ? Math.min(100, Math.round((progress.verified_words / challenge.goal_words) * 100)) : 0;
  const remaining = progress ? Math.max(0, challenge.goal_words - progress.verified_words) : 0;
  const maxDay = Math.max(1, ...shownDays.map((d) => progress?.daily?.[d] || 0));

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-12 md:px-10">
        <Link href="/challenges" className="font-ui text-sm text-accent hover:underline">
          ← All challenges
        </Link>
        <p className="font-ui mt-6 text-xs uppercase tracking-[0.2em] text-accent">
          {challenge.kind === "group" ? "Group challenge" : "Writing challenge"} ·{" "}
          {status === "active" ? "Running now" : status === "upcoming" ? "Coming up" : "Ended"}
        </p>
        <h1 className="font-display mt-2 text-5xl leading-tight">{challenge.title}</h1>
        <p className="font-ui mt-3 text-muted">
          {fmt(challenge.starts_on)} to {fmt(challenge.ends_on)} · Goal: {challenge.goal_words.toLocaleString()} verified words
        </p>
        {challenge.description && <p className="mt-4 max-w-2xl whitespace-pre-wrap text-ink">{challenge.description}</p>}
        <p className="font-ui mt-4 text-sm text-muted">
          {board.participants.toLocaleString()} writer{board.participants === 1 ? "" : "s"} ·{" "}
          {board.totalWords.toLocaleString()} verified words so far
        </p>

        <div className="mt-6">
          <ChallengeActions
            slug={slug}
            code={code || null}
            loggedIn={Boolean(user)}
            joined={Boolean(progress)}
            ended={status === "ended"}
            showOnLeaderboard={progress?.show_on_leaderboard ?? true}
            inviteUrl={isCreator && challenge.join_code ? appUrl(`${path}?code=${challenge.join_code}`) : null}
          />
        </div>

        {progress && (
          <section className="mt-10 border border-line p-6">
            <h2 className="font-display text-2xl">Your progress</h2>
            {progress.completed_at && (
              <p className="font-ui mt-2 inline-block border border-accent px-3 py-1 text-sm text-accent">
                Winner: you reached {challenge.goal_words.toLocaleString()} verified words
              </p>
            )}
            <div className="mt-4 h-3 w-full bg-paper-deep">
              <div className="h-3 bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <dl className="font-ui mt-4 grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Verified words</dt>
                <dd className="text-2xl text-ink">{progress.verified_words.toLocaleString()}</dd>
                <dd className="text-xs text-muted">{pct}% of the goal</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Days written</dt>
                <dd className="text-2xl text-ink">{progress.days_written}</dd>
                <dd className="text-xs text-muted">{STREAK_MIN_WORDS}+ words counts as a day</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Streak</dt>
                <dd className="text-2xl text-ink">{progress.current_streak}</dd>
                <dd className="text-xs text-muted">Best {progress.best_streak}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{status === "ended" ? "Final" : "To finish"}</dt>
                {status === "ended" || remaining === 0 ? (
                  <dd className="text-2xl text-ink">{remaining === 0 ? "Done" : `${remaining.toLocaleString()} short`}</dd>
                ) : (
                  <>
                    <dd className="text-2xl text-ink">{Math.ceil(remaining / Math.max(1, daysLeft)).toLocaleString()}</dd>
                    <dd className="text-xs text-muted">
                      words a day for {daysLeft} day{daysLeft === 1 ? "" : "s"}
                    </dd>
                  </>
                )}
              </div>
            </dl>
            {shownDays.length > 0 && (
              <div className="mt-6">
                <div className="flex h-24 items-end gap-0.5" aria-label="Verified words per day">
                  {shownDays.map((d) => {
                    const w = progress.daily?.[d] || 0;
                    return (
                      <div
                        key={d}
                        title={`${d}: ${w.toLocaleString()} words`}
                        className={w >= STREAK_MIN_WORDS ? "flex-1 bg-accent" : "flex-1 bg-line"}
                        style={{ height: `${Math.max(3, (w / maxDay) * 100)}%` }}
                      />
                    );
                  })}
                </div>
                <p className="font-ui mt-1 text-[11px] text-muted">Verified words per day, in your time zone ({tz}).</p>
              </div>
            )}
            <p className="font-ui mt-4 text-xs text-muted">
              Words count when you write in the editor. Pasted or imported text, and text you type and then delete, don&apos;t
              count. Numbers update when you visit and once a day.
            </p>
            {(challenge.is_public || progress.show_on_leaderboard) && (
              <div className="mt-6 border-t border-line pt-4">
                <ShareKit
                  path={challenge.is_public ? path : `${path}?code=${challenge.join_code || ""}`}
                  title={challenge.title}
                  heading="Share your progress"
                  posts={[
                    {
                      label: "Progress",
                      text: progress.completed_at
                        ? `I finished ${challenge.title}: ${progress.verified_words.toLocaleString()} verified words, every one typed by me.`
                        : `${progress.verified_words.toLocaleString()} verified words into ${challenge.title}. Every word typed, none pasted. Join me:`,
                    },
                    { label: "Streak", text: `Day ${progress.current_streak} of my writing streak in ${challenge.title}.` },
                  ]}
                  squareImagePath={progress.show_on_leaderboard ? `${path}/card?u=${progress.user_id}&size=square` : undefined}
                />
              </div>
            )}
          </section>
        )}

        <section className="mt-10">
          <h2 className="font-display text-2xl">Leaderboard</h2>
          {board.rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No words yet. Be the first.</p>
          ) : (
            <ol className="font-ui mt-4 divide-y divide-line border border-line">
              {board.rows.map((r, i) => (
                <li key={r.userId} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm ${r.userId === user?.id ? "bg-accent/5" : ""}`}>
                  <span className="w-6 text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.href ? (
                      <Link href={r.href} className="text-ink hover:text-accent">
                        {r.name}
                      </Link>
                    ) : (
                      r.name
                    )}
                    {r.completed && <span className="ml-2 text-xs text-accent">Winner</span>}
                  </span>
                  <span className="text-muted">{r.currentStreak > 1 ? `${r.currentStreak}-day streak` : ""}</span>
                  <span className="w-28 text-right text-ink">{r.verifiedWords.toLocaleString()} words</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}

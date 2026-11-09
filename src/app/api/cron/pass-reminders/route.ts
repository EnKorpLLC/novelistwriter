import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/beta-social";
import { optedInUserIds } from "@/lib/notifications";
import { renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/stripe";
import { emailRedAlarms } from "@/lib/money";
import { refreshActiveChallenges } from "@/lib/challenges";
import { runAffiliatePayouts } from "@/lib/affiliates";
import { enqueueEmails, processEmailQueue, type QueuedEmail } from "@/lib/email-queue";

export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

type Stage = "3d" | "1d" | "ended";

const COPY: Record<Stage, { title: string; lead: string }> = {
  "3d": {
    title: "Your free Studio pass ends in 3 days",
    lead: "Your free Studio pass ends in 3 days.",
  },
  "1d": {
    title: "Your free Studio pass ends tomorrow",
    lead: "Your free Studio pass ends within a day.",
  },
  ended: {
    title: "Your free Studio pass has ended",
    lead: "Your free Studio pass has ended. Beta and ARC listings and new invites are paused, and current readers have 7 days to finish.",
  },
};

/** Posts planned for today on the marketing calendar: one reminder per author, emailed only if opted in. */
async function remindMarketingPosts(admin: ReturnType<typeof createServiceClient>) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  const { data: posts, error } = await admin
    .from("marketing_posts")
    .select("id, user_id")
    .eq("status", "planned")
    .is("reminded_at", null)
    .gte("post_on", yesterday)
    .lte("post_on", today)
    .limit(2000);
  if (error || !posts?.length) return;
  const byUser = new Map<string, string[]>();
  for (const p of posts) byUser.set(p.user_id, [...(byUser.get(p.user_id) || []), p.id]);
  const ids = [...byUser.keys()];
  const [emailOk, { data: profiles }] = await Promise.all([optedInUserIds(admin, ids), admin.from("profiles").select("id, email").in("id", ids)]);
  const emailById = new Map((profiles || []).map((p) => [p.id, p.email as string | null]));
  const mails: QueuedEmail[] = [];
  for (const [userId, postIds] of byUser) {
    const title = postIds.length === 1 ? "You have a post planned for today" : `You have ${postIds.length} posts planned for today`;
    await createNotification(admin, { userId, type: "marketing_reminder", title, body: "Your text is ready to copy or share.", href: "/dashboard/marketing" });
    const to = emailById.get(userId);
    if (to && emailOk.has(userId)) {
      const mail = renderEmail({
        heading: title,
        paragraphs: ["Your marketing calendar has a post for today. Open it to copy the text, download your card, or share in one tap."],
        button: { label: "Open your calendar", url: appUrl("/dashboard/marketing") },
        notification: true,
      });
      mails.push({ to, subject: title, text: mail.text, html: mail.html });
    }
    await admin.from("marketing_posts").update({ reminded_at: new Date().toISOString() }).in("id", postIds);
  }
  if (mails.length) await enqueueEmails(admin, mails);
}

/** Daily Vercel Cron job: pass ending soon or just ended. In-app for everyone, email only if opted in. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();
  // Rides along on this daily job (Hobby allows few crons): email the owner if a free plan is nearly full,
  // and bring challenge leaderboards up to date
  await emailRedAlarms(admin);
  // Marketing reminders join the queue, then launch emails that didn't fit in yesterday's Gmail budget, then challenge leaderboards
  await remindMarketingPosts(admin).catch(() => null);
  await processEmailQueue(admin, { timeBudgetMs: 25_000 }).catch(() => null);
  await refreshActiveChallenges(admin, 120).catch(() => 0);
  // Affiliate commissions go out once a month
  if (new Date().getUTCDate() === 1) await runAffiliatePayouts(admin, { timeBudgetMs: 15_000 }).catch(() => null);
  const now = Date.now();
  const { data: rows, error } = await admin
    .from("credit_balances")
    .select("user_id, subscription_tier, pass_active_until, pass_warned_3d_at, pass_warned_1d_at, pass_ended_emailed_at")
    .not("pass_active_until", "is", null)
    .gte("pass_active_until", new Date(now - DAY_MS).toISOString())
    .lte("pass_active_until", new Date(now + 3 * DAY_MS).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due: { userId: string; stage: Stage }[] = [];
  for (const r of rows || []) {
    if (r.subscription_tier === "studio") continue;
    const left = Date.parse(r.pass_active_until) - now;
    if (left <= 0) {
      if (!r.pass_ended_emailed_at) due.push({ userId: r.user_id, stage: "ended" });
    } else if (left <= DAY_MS) {
      if (!r.pass_warned_1d_at) due.push({ userId: r.user_id, stage: "1d" });
    } else if (!r.pass_warned_3d_at) {
      due.push({ userId: r.user_id, stage: "3d" });
    }
  }
  if (!due.length) return NextResponse.json({ ok: true, sent: 0 });

  const ids = due.map((d) => d.userId);
  const [emailOk, { data: profiles }] = await Promise.all([
    optedInUserIds(admin, ids),
    admin.from("profiles").select("id, email").in("id", ids),
  ]);
  const emailById = new Map((profiles || []).map((p) => [p.id, p.email as string | null]));
  let emailed = 0;

  for (const d of due) {
    const copy = COPY[d.stage];
    await createNotification(admin, {
      userId: d.userId,
      type: "studio_pass",
      title: copy.title,
      body: "Get Studio, get Pro, or earn more free days.",
      href: "/dashboard",
    });
    const to = emailById.get(d.userId);
    if (to && emailOk.has(d.userId)) {
      const mail = renderEmail({
        heading: copy.title,
        paragraphs: [
          copy.lead,
          "Keep everything with Studio, keep all your projects open with Pro, or earn more free days by sharing your books.",
        ],
        button: { label: "See your options", url: appUrl("/dashboard") },
        notification: true,
      });
      const sent = await sendEmail({ to, subject: copy.title, text: mail.text, html: mail.html });
      if (sent.ok) emailed += 1;
    }
    const stamp = new Date().toISOString();
    const column =
      d.stage === "3d" ? "pass_warned_3d_at" : d.stage === "1d" ? "pass_warned_1d_at" : "pass_ended_emailed_at";
    await admin.from("credit_balances").update({ [column]: stamp }).eq("user_id", d.userId);
  }

  return NextResponse.json({ ok: true, notified: due.length, emailed });
}

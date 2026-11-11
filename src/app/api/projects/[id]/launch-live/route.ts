import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { normalizeBuyLinks } from "@/lib/arc";
import { bookPath } from "@/lib/handles";
import { appUrl } from "@/lib/stripe";
import { renderEmail } from "@/lib/email";
import { optedInUserIds } from "@/lib/notifications";
import { enqueueEmails, oneClickUnsubscribeUrl, processEmailQueue, unsubscribeUrl, type QueuedEmail } from "@/lib/email-queue";
import { normalizeLaunchPlan } from "@/lib/launch-plan";
import { normalizeDetails } from "@/lib/book/format";
import { pingIndexNow } from "@/lib/seo";
import { deliverPreorders } from "@/lib/preorders";

export const maxDuration = 60;

/**
 * L2: the one "We're live" push. Marks the book out now, emails readers who asked to hear about it and
 * followers who allow email, notifies followers in the app, and asks ARC readers to post their reviews.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userHasStudio(user.id))) {
    return NextResponse.json({ error: "The launch-day push is part of Studio. Upgrade on the Billing page.", code: "studio_required" }, { status: 403 });
  }
  const plan = normalizeLaunchPlan(project.launch_plan);
  if (plan.liveSentAt) {
    return NextResponse.json({ error: `You already sent your launch announcement on ${new Date(plan.liveSentAt).toLocaleDateString()}.` }, { status: 409 });
  }
  const buy = normalizeBuyLinks(project.buy_links).filter((l) => !l.preorder && !l.serial);
  if (!buy.length) return NextResponse.json({ error: "Add at least one buy link (not a preorder link) on this tab first." }, { status: 400 });

  const admin = createServiceClient();
  const [{ data: profile }, { data: listRows }, { data: followRows }, { data: arcRows }] = await Promise.all([
    admin.from("profiles").select("display_name, email, handle").eq("id", user.id).maybeSingle(),
    admin
      .from("author_subscribers")
      .select("email, display_name")
      .eq("author_user_id", user.id)
      .not("confirmed_at", "is", null)
      .is("unsubscribed_at", null)
      .contains("release_project_ids", [id]),
    admin.from("beta_author_follows").select("reader_user_id").eq("author_user_id", user.id),
    admin.from("arc_invites").select("reader_user_id, email").eq("project_id", id).eq("status", "active"),
  ]);

  const now = new Date().toISOString();
  if (!project.published) {
    await admin.from("projects").update({ published: true, published_at: now, updated_at: now }).eq("id", id);
  }
  await deliverPreorders(admin, id).catch(() => 0);

  const author = normalizeDetails(project.book_details).penName || profile?.display_name || "The author";
  const title = project.title || "the book";
  const launchUrl = profile?.handle && project.slug ? appUrl(bookPath(profile.handle, project.slug)) : null;
  const target = launchUrl || buy[0].url;
  const pitch = String(project.tagline || "").trim() || String(project.blurb || "").trim().split(/\n\s*\n/)[0]?.slice(0, 400) || "";

  // Release list: one email each, with an unsubscribe link for this author's list
  const sentTo = new Set<string>();
  const queue: QueuedEmail[] = [];
  for (const row of listRows || []) {
    const email = String(row.email || "").toLowerCase();
    if (!email.includes("@") || sentTo.has(email)) continue;
    sentTo.add(email);
    const mail = renderEmail({
      heading: `${title} is out now`,
      paragraphs: [`${row.display_name ? `${row.display_name}, you` : "You"} asked to hear the day ${title} by ${author} came out. It's here.`, pitch].filter(Boolean),
      button: { label: "Get your copy", url: target },
      footer: `You're getting this because you joined ${author}'s list. Unsubscribe: ${unsubscribeUrl(user.id, email)}`,
    });
    queue.push({
      to: email,
      subject: `${title} is out now`,
      html: mail.html,
      text: mail.text,
      replyTo: profile?.email,
      listUnsubscribe: oneClickUnsubscribeUrl(user.id, email),
    });
  }

  // Followers: in-app for all, email for those who agreed to notification emails
  const followerIds = [...new Set((followRows || []).map((f) => f.reader_user_id).filter(Boolean))] as string[];
  if (followerIds.length) {
    await admin.from("beta_notifications").insert(
      followerIds.map((uid) => ({
        user_id: uid,
        type: "book_released",
        title: `${author} has a new book out`,
        body: title,
        href: launchUrl,
        meta: { projectId: id, authorUserId: user.id },
      }))
    );
    const emailIds = [...(await optedInUserIds(admin, followerIds))];
    const { data: followerProfiles } = emailIds.length ? await admin.from("profiles").select("email").in("id", emailIds) : { data: [] };
    const mail = renderEmail({
      heading: `${author} has a new book out`,
      paragraphs: [`${title} is out today.`, pitch].filter(Boolean),
      button: { label: "See the book", url: target },
      footer: "You're getting this because you follow this author. Unfollow from your reader dashboard.",
      notification: true,
    });
    for (const p of followerProfiles || []) {
      const email = String(p.email || "").toLowerCase();
      if (!email.includes("@") || sentTo.has(email)) continue;
      sentTo.add(email);
      queue.push({ to: email, subject: `New from ${author}: ${title}`, html: mail.html, text: mail.text, replyTo: profile?.email, kind: "notification" });
    }
  }

  // ARC readers: it's live, post your review today
  const arcIds = [...new Set((arcRows || []).map((a) => a.reader_user_id).filter(Boolean))] as string[];
  if (arcIds.length) {
    await admin.from("beta_notifications").insert(
      arcIds.map((uid) => ({
        user_id: uid,
        type: "arc_review_push",
        title: `${title} is live: post your review today`,
        body: "Reviews in launch week help the most. Your store links are ready.",
        href: `/arc/book/${id}`,
        meta: { projectId: id },
      }))
    );
    const emailIds = [...(await optedInUserIds(admin, arcIds))];
    const { data: arcProfiles } = emailIds.length ? await admin.from("profiles").select("email").in("id", emailIds) : { data: [] };
    const mail = renderEmail({
      heading: `${title} is live`,
      paragraphs: [
        `Thank you for reading ${title} early. It's out today, and reviews posted this week help other readers find it most.`,
        "Your review and one-tap links for each store are waiting on the book's ARC page.",
      ],
      button: { label: "Post my review", url: appUrl(`/arc/book/${id}`) },
      notification: true,
    });
    for (const p of arcProfiles || []) {
      const email = String(p.email || "").toLowerCase();
      if (!email.includes("@")) continue;
      queue.push({ to: email, subject: `${title} is live: post your review`, html: mail.html, text: mail.text, replyTo: profile?.email, kind: "notification" });
    }
  }

  // Launch team: it's go time
  const { data: team } = await admin.from("launch_team").select("user_id").eq("project_id", id);
  if (team?.length) {
    await admin.from("beta_notifications").insert(
      team.map((t) => ({
        user_id: t.user_id,
        type: "launch_team",
        title: `Launch day: ${title} is out`,
        body: "Time to share it and tick off your launch team tasks.",
        href: launchUrl,
        meta: { projectId: id },
      }))
    );
  }

  const liveStats = { emails: queue.length, followers: followerIds.length, arcReaders: arcIds.length };
  await admin.from("projects").update({ launch_plan: { ...plan, liveSentAt: now, liveStats } }).eq("id", id);
  if (queue.length) await enqueueEmails(admin, queue);
  const result = queue.length ? await processEmailQueue(admin, { timeBudgetMs: 30_000 }) : { sent: 0, waiting: 0 };
  if (profile?.handle && project.slug) void pingIndexNow([bookPath(profile.handle, project.slug)]);

  return NextResponse.json({ ok: true, ...liveStats, sentNow: result.sent, waiting: result.waiting });
}

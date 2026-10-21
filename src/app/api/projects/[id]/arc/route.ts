import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { appUrl } from "@/lib/stripe";
import { sanitizeDisplayName } from "@/lib/beta-access";
import { createNotification } from "@/lib/beta-social";
import {
  authorContact,
  joinAuthorAudience,
  notifyFollowersOfOpening,
} from "@/lib/audience";
import {
  canRemind,
  isArcDeadlinePassed,
  isArcWindowOpen,
  normalizeMailingAddress,
  normalizeReviewLinks,
} from "@/lib/arc";
import { emailConfigured, renderEmail, sendEmail } from "@/lib/email";
import { emailConsentByEmail, emailConsentFor } from "@/lib/notifications";

const ARC_PROJECT_FIELDS =
  "id, title, user_id, arc_open, arc_deadline, arc_collect_address, arc_review_links";

type ArcProject = {
  id: string;
  title: string;
  user_id: string;
  arc_open: boolean;
  arc_deadline: string | null;
  arc_collect_address: boolean;
  arc_review_links: unknown;
};

function migrationHint(message: string) {
  if (message.includes("arc_") || message.includes("author_subscribers")) {
    return "Database needs an update. Run supabase/migration_platform_admin.sql in the Supabase SQL editor.";
  }
  return message;
}

function studioRequired() {
  return NextResponse.json(
    {
      error: "ARC reader tools are included with Studio. Upgrade on the Billing page.",
      code: "studio_required",
      studioAccess: false,
    },
    { status: 403 }
  );
}

async function requireOwner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: project, error } = await supabase
    .from("projects")
    .select(ARC_PROJECT_FIELDS)
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return { error: NextResponse.json({ error: migrationHint(error.message) }, { status: 500 }) };
  }
  if (!project) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { user, project: project as ArcProject };
}

function arcBookLink(projectId: string) {
  return appUrl(`/arc/book/${projectId}`);
}

function formatDeadline(iso: string | null) {
  if (!iso) return "no set date";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function readerUserIdForEmail(admin: SupabaseClient, email: string) {
  const { data } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  return data?.id || null;
}

/** Email + in-app note that a reader now has access. */
async function sendArcAccessNotice(
  admin: SupabaseClient,
  project: ArcProject,
  invite: { email: string; display_name: string | null; reader_user_id: string | null }
) {
  const author = await authorContact(admin, project.user_id);
  const url = arcBookLink(project.id);
  const mail = renderEmail({
    heading: `Your advance copy of "${project.title}"`,
    paragraphs: [
      invite.display_name ? `Hi ${invite.display_name},` : "Hi,",
      `${author.name} has given you an advance reader copy of "${project.title}". Please finish reading by ${formatDeadline(project.arc_deadline)}.`,
      "Sign in (or create a free reader account) with this email address to open it.",
    ],
    button: { label: "Open your ARC", url },
    footer: "Reply to this email to reach the author directly.",
  });
  await sendEmail({
    to: invite.email,
    subject: `Your ARC of "${project.title}" from ${author.name}`,
    text: mail.text,
    html: mail.html,
    replyTo: author.email,
  });
  const readerId = invite.reader_user_id || (await readerUserIdForEmail(admin, invite.email));
  if (readerId) {
    await createNotification(admin, {
      userId: readerId,
      type: "arc_invite",
      title: `ARC of "${project.title}" is ready`,
      body: `Read by ${formatDeadline(project.arc_deadline)}.`,
      href: `/arc/book/${project.id}`,
      meta: { projectId: project.id },
    });
  }
  await joinAuthorAudience(admin, {
    authorUserId: project.user_id,
    email: invite.email,
    displayName: invite.display_name,
    readerUserId: readerId,
    source: "arc",
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const auth = await requireOwner(projectId);
  if ("error" in auth) return auth.error;
  const { user, project } = auth;

  if (!(await userHasStudio(user.id))) {
    return NextResponse.json({ studioAccess: false });
  }

  const admin = createServiceClient();
  const [{ data: invites, error }, { data: chapters }] = await Promise.all([
    admin
      .from("arc_invites")
      .select(
        "id, email, display_name, reader_user_id, status, current_chapter_id, last_read_at, finished_at, last_reminded_at, review_body, review_posts, mailing_address, created_at"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    admin.from("chapters").select("id, title").eq("project_id", projectId),
  ]);
  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  const chapterTitle = new Map((chapters || []).map((c) => [c.id, c.title]));
  const consentByEmail = await emailConsentByEmail(
    admin,
    (invites || []).map((i) => ({ email: i.email, userId: i.reader_user_id }))
  );
  const deadlineMs = project.arc_deadline ? Date.parse(project.arc_deadline) : null;

  return NextResponse.json({
    studioAccess: true,
    emailReady: emailConfigured(),
    shareLink: arcBookLink(projectId),
    arcOpen: Boolean(project.arc_open),
    deadline: project.arc_deadline,
    deadlinePassed: isArcDeadlinePassed(project.arc_deadline),
    windowOpen: isArcWindowOpen(project),
    collectAddress: Boolean(project.arc_collect_address),
    reviewLinks: normalizeReviewLinks(project.arc_review_links),
    invites: (invites || []).map((i) => ({
      id: i.id,
      email: i.email,
      displayName: i.display_name,
      status: i.status,
      hasAccount: consentByEmail.get(i.email.toLowerCase())?.hasAccount ?? Boolean(i.reader_user_id),
      emailOptIn: consentByEmail.get(i.email.toLowerCase())?.optedIn ?? false,
      lastReadAt: i.last_read_at,
      currentChapterTitle: i.current_chapter_id
        ? chapterTitle.get(i.current_chapter_id) || null
        : null,
      finishedAt: i.finished_at,
      finishedOnTime:
        Boolean(i.finished_at) &&
        (deadlineMs == null || Date.parse(i.finished_at as string) <= deadlineMs),
      lastRemindedAt: i.last_reminded_at,
      canRemind: canRemind(i.last_reminded_at),
      reviewBody: i.review_body,
      reviewPosts: (i.review_posts as Record<string, string>) || {},
      mailingAddress: normalizeMailingAddress(i.mailing_address),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const auth = await requireOwner(projectId);
  if ("error" in auth) return auth.error;
  const { user, project } = auth;
  if (!(await userHasStudio(user.id))) return studioRequired();

  const body = (await req.json()) as {
    action?: string;
    deadline?: string | null;
    collectAddress?: boolean;
    reviewLinks?: unknown;
    email?: string;
    displayName?: string;
    inviteId?: string;
  };
  const admin = createServiceClient();
  const now = new Date().toISOString();

  function parseDeadline(raw: unknown): string | null | "invalid" {
    if (raw == null || raw === "") return null;
    const d = new Date(String(raw));
    return Number.isNaN(d.getTime()) ? "invalid" : d.toISOString();
  }

  if (body.action === "saveSettings") {
    const deadline = parseDeadline(body.deadline);
    if (deadline === "invalid") {
      return NextResponse.json({ error: "Invalid deadline" }, { status: 400 });
    }
    const reviewLinks = normalizeReviewLinks(body.reviewLinks);
    const { error } = await admin
      .from("projects")
      .update({
        arc_deadline: deadline,
        arc_collect_address: Boolean(body.collectAddress),
        arc_review_links: reviewLinks,
        updated_at: now,
      })
      .eq("id", projectId);
    if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
    await admin
      .from("arc_invites")
      .update({ deadline })
      .eq("project_id", projectId)
      .eq("status", "active");
    return NextResponse.json({ ok: true, deadline, reviewLinks });
  }

  if (body.action === "open") {
    const deadline = parseDeadline(body.deadline ?? project.arc_deadline);
    if (!deadline || deadline === "invalid" || isArcDeadlinePassed(deadline)) {
      return NextResponse.json(
        { error: "Set a read-by deadline in the future before opening the ARC." },
        { status: 400 }
      );
    }
    const wasOpen = isArcWindowOpen(project);
    const { error } = await admin
      .from("projects")
      .update({ arc_open: true, arc_deadline: deadline, updated_at: now })
      .eq("id", projectId);
    if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
    if (!wasOpen) {
      try {
        await notifyFollowersOfOpening(admin, {
          authorUserId: user.id,
          projectId,
          projectTitle: project.title,
          kind: "arc",
        });
      } catch {
        /* non-fatal */
      }
    }
    return NextResponse.json({ ok: true, arcOpen: true, deadline });
  }

  if (body.action === "close") {
    const { error } = await admin
      .from("projects")
      .update({ arc_open: false, updated_at: now })
      .eq("id", projectId);
    if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
    return NextResponse.json({ ok: true, arcOpen: false });
  }

  if (body.action === "invite") {
    if (!isArcWindowOpen(project)) {
      return NextResponse.json(
        { error: "Open the ARC with a deadline before adding readers." },
        { status: 400 }
      );
    }
    const email = String(body.email || "").trim().toLowerCase();
    if (!email.includes("@")) return NextResponse.json({ error: "Email required" }, { status: 400 });
    const displayName = sanitizeDisplayName(body.displayName) || null;
    const readerUserId = await readerUserIdForEmail(admin, email);

    const { data: existing } = await admin
      .from("arc_invites")
      .select("id, status, display_name")
      .eq("project_id", projectId)
      .eq("email", email)
      .maybeSingle();
    if (existing?.status === "active") {
      return NextResponse.json({ error: "That reader already has this ARC." }, { status: 400 });
    }
    const row = {
      status: "active",
      deadline: project.arc_deadline,
      display_name: displayName || existing?.display_name || null,
      ...(readerUserId ? { reader_user_id: readerUserId } : {}),
    };
    const { error } = existing
      ? await admin.from("arc_invites").update(row).eq("id", existing.id)
      : await admin.from("arc_invites").insert({
          ...row,
          project_id: projectId,
          user_id: user.id,
          email,
        });
    if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });

    await sendArcAccessNotice(admin, project, {
      email,
      display_name: row.display_name,
      reader_user_id: readerUserId,
    });
    return NextResponse.json({ ok: true, link: arcBookLink(projectId) });
  }

  if (body.action === "approve" || body.action === "deny" || body.action === "remove") {
    const { data: inv } = await admin
      .from("arc_invites")
      .select("id, email, display_name, reader_user_id, status")
      .eq("id", String(body.inviteId || ""))
      .eq("project_id", projectId)
      .maybeSingle();
    if (!inv) return NextResponse.json({ error: "Reader not found" }, { status: 404 });
    if (body.action === "approve" && !isArcWindowOpen(project)) {
      return NextResponse.json({ error: "The ARC window is closed." }, { status: 400 });
    }
    const status =
      body.action === "approve" ? "active" : body.action === "deny" ? "denied" : "revoked";
    const { error } = await admin
      .from("arc_invites")
      .update({ status, ...(status === "active" ? { deadline: project.arc_deadline } : {}) })
      .eq("id", inv.id);
    if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
    if (status === "active") await sendArcAccessNotice(admin, project, inv);
    return NextResponse.json({ ok: true, status });
  }

  if (body.action === "remind") {
    const { data: inv } = await admin
      .from("arc_invites")
      .select("id, email, display_name, reader_user_id, status, finished_at, last_reminded_at")
      .eq("id", String(body.inviteId || ""))
      .eq("project_id", projectId)
      .maybeSingle();
    if (!inv) return NextResponse.json({ error: "Reader not found" }, { status: 404 });
    if (inv.status !== "active" || inv.finished_at) {
      return NextResponse.json(
        { error: "Only active ARC readers who haven't finished can get a reminder." },
        { status: 400 }
      );
    }
    if (!isArcWindowOpen(project)) {
      return NextResponse.json({ error: "The ARC deadline has already passed." }, { status: 400 });
    }
    if (!canRemind(inv.last_reminded_at)) {
      return NextResponse.json(
        { error: "You reminded this reader in the last 7 days." },
        { status: 429 }
      );
    }
    const consent = await emailConsentFor(admin, { userId: inv.reader_user_id, email: inv.email });
    if (!consent.userId) {
      return NextResponse.json(
        {
          error:
            "This reader hasn't created an account yet, so there's nowhere to send a reminder. Send them the ARC link yourself.",
        },
        { status: 400 }
      );
    }

    const author = await authorContact(admin, user.id);
    const due = formatDeadline(project.arc_deadline);
    let channel: "email" | "in_app" = "in_app";
    if (consent.optedIn && emailConfigured()) {
      const daysLeft = project.arc_deadline
        ? Math.max(0, Math.ceil((Date.parse(project.arc_deadline) - Date.now()) / 86400000))
        : null;
      const mail = renderEmail({
        heading: `"${project.title}" is due ${due}`,
        paragraphs: [
          inv.display_name ? `Hi ${inv.display_name},` : "Hi,",
          `A friendly reminder from ${author.name}: your advance copy of "${project.title}" is due ${due}${daysLeft != null ? ` (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)` : ""}.`,
          "When you finish, the reading page has one-tap links to leave your review.",
        ],
        button: { label: "Keep reading", url: arcBookLink(projectId) },
        footer: "Reply to this email to reach the author directly.",
        notification: true,
      });
      const sent = await sendEmail({
        to: inv.email,
        subject: `Reminder: "${project.title}" ARC due ${due}`,
        text: mail.text,
        html: mail.html,
        replyTo: author.email,
      });
      if (sent.ok) channel = "email";
    }

    await admin.from("arc_invites").update({ last_reminded_at: now }).eq("id", inv.id);
    await createNotification(admin, {
      userId: consent.userId,
      type: "arc_deadline",
      title: `"${project.title}" ARC due ${due}`,
      body: `${author.name} sent a reminder.`,
      href: `/arc/book/${projectId}`,
      meta: { projectId },
    });
    return NextResponse.json({ ok: true, lastRemindedAt: now, channel });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

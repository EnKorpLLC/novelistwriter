import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { accessMessageForStatus, BETA_PERIOD_ENDED_REASON } from "@/lib/beta-access";
import { normalizeBetaApplicationForm } from "@/lib/beta-form";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { genreLabel, linkInvitesForEmail } from "@/lib/beta-platform";
import { enforceBetaAccessGates, findReaderInvite, inviteAllowsReading } from "@/lib/beta-server";
import { pauseForLostStudio } from "@/lib/studio-access";
import { userHasStudio } from "@/lib/credits";
import { normalizePublicLinks, publicLinkList } from "@/lib/public-profile";
import { isSubscribed } from "@/lib/audience";
import { trustBadgesForBook } from "@/lib/trust-badges";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createServiceClient();
  const { data: project } = await admin
    .from("projects")
    .select(
      "id, title, genre, cover_path, updated_at, user_id, beta_ready, beta_application_form, beta_expires_at"
    )
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authorHasStudio = await userHasStudio(project.user_id);
  // Public catalog / apply gate is Studio-only; current readers get the 7-day grace window
  if (project.beta_ready && !authorHasStudio) {
    await pauseForLostStudio(admin, [projectId]);
    project.beta_ready = false;
  }

  const publiclyListed = Boolean(project.beta_ready && authorHasStudio);

  if (!publiclyListed && !user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Authors can always view their own book gate; others need a Studio listing or invite
  if (!publiclyListed && user?.id !== project.user_id) {
    const invite = user
      ? await findReaderInvite(admin, { projectId, userId: user.id, email: user.email })
      : null;
    if (!invite) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  await enforceBetaAccessGates(admin, project);

  const { data: author } = await admin
    .from("profiles")
    .select("display_name, public_links")
    .eq("id", project.user_id)
    .maybeSingle();

  const { data: reviews } = await admin
    .from("beta_book_reviews")
    .select("id, body, created_at, reader_user_id, invite_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  const reviewInviteIds = [...new Set((reviews || []).map((r) => r.invite_id))];
  const { data: reviewInvites } = reviewInviteIds.length
    ? await admin.from("beta_invites").select("id, display_name, email").in("id", reviewInviteIds)
    : { data: [] as { id: string; display_name: string | null; email: string }[] };
  const inviteLabel = new Map(
    (reviewInvites || []).map((i) => [
      i.id,
      i.display_name?.trim() || i.email.split("@")[0] || "Reader",
    ])
  );

  const form = normalizeBetaApplicationForm(project.beta_application_form);
  const base: Record<string, unknown> & { subscribed?: boolean } = {
    projectId: project.id,
    title: project.title,
    genre: genreLabel(project.genre),
    betaReady: publiclyListed,
    authorUserId: project.user_id,
    authorName: author?.display_name || "Author",
    authorLinks: publicLinkList(normalizePublicLinks(author?.public_links)),
    trust: await trustBadgesForBook(admin, project.user_id, projectId),
    canSubscribe: authorHasStudio,
    coverUrl: coverPublicUrl(
      projectCoverPath(project),
      project.updated_at ? Date.parse(project.updated_at) : undefined
    ),
    applicationForm: form,
    reviews: (reviews || []).map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      readerName: inviteLabel.get(r.invite_id) || "Reader",
    })),
  };

  if (!user) {
    return NextResponse.json({
      ...base,
      loggedIn: false,
      access: "login_required" as const,
    });
  }

  await linkInvitesForEmail(admin, user.id, user.email);
  const invite = await findReaderInvite(admin, {
    projectId,
    userId: user.id,
    email: user.email,
  });
  base.subscribed = await isSubscribed(admin, {
    authorUserId: project.user_id,
    email: user.email,
  });

  if (inviteAllowsReading(invite)) {
    return NextResponse.json({
      ...base,
      loggedIn: true,
      access: "approved" as const,
      inviteId: invite!.id,
      status: invite!.status,
      currentChapterId: invite!.current_chapter_id,
      finishedAt: invite!.finished_at,
      readUrl: `/beta/read/${projectId}`,
    });
  }

  if (invite?.status === "requested") {
    const msg = accessMessageForStatus("requested", invite.status_reason);
    return NextResponse.json({
      ...base,
      loggedIn: true,
      access: "pending_review" as const,
      status: invite.status,
      message: msg.message,
      reason: msg.reason,
    });
  }

  if (invite?.status === "backup") {
    const msg = accessMessageForStatus("backup", invite.status_reason);
    return NextResponse.json({
      ...base,
      loggedIn: true,
      access: "backup" as const,
      status: invite.status,
      message: msg.message,
      reason: msg.reason,
    });
  }

  if (invite?.status === "denied" || invite?.status === "revoked") {
    // Book open again → allow reapply (apply API restores the invite row)
    if (publiclyListed) {
      return NextResponse.json({
        ...base,
        loggedIn: true,
        access: "apply" as const,
        reapply: true,
        previousStatus: invite.status,
        email: user.email || null,
        message:
          invite.status === "revoked"
            ? "Your previous access was removed. You can apply again while this book is open for beta."
            : "Your previous application was denied. You can apply again while this book is open for beta.",
      });
    }
    const msg = accessMessageForStatus(
      invite.status,
      invite.status_reason ||
        (invite.status_reason === BETA_PERIOD_ENDED_REASON
          ? BETA_PERIOD_ENDED_REASON
          : invite.status_reason)
    );
    return NextResponse.json({
      ...base,
      loggedIn: true,
      access: invite.status === "denied" ? ("denied" as const) : ("removed" as const),
      status: invite.status,
      message: msg.message,
      reason: msg.reason,
    });
  }

  return NextResponse.json({
    ...base,
    loggedIn: true,
    access: "apply" as const,
    email: user.email || null,
  });
}

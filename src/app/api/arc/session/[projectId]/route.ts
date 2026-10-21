import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { genreLabel } from "@/lib/beta-platform";
import { sanitizeDisplayName } from "@/lib/beta-access";
import { normalizePublicLinks, publicLinkList } from "@/lib/public-profile";
import { isSubscribed, joinAuthorAudience } from "@/lib/audience";
import { trustBadgesForBook } from "@/lib/trust-badges";
import {
  isArcDeadlinePassed,
  isArcWindowOpen,
  normalizeMailingAddress,
  normalizeReviewLinks,
  reviewSiteKey,
} from "@/lib/arc";

type ArcInviteRow = {
  id: string;
  email: string;
  display_name: string | null;
  reader_user_id: string | null;
  status: string;
  current_chapter_id: string | null;
  finished_at: string | null;
  review_body: string | null;
  review_posts: Record<string, string> | null;
  mailing_address: unknown;
};

const INVITE_FIELDS =
  "id, email, display_name, reader_user_id, status, current_chapter_id, finished_at, review_body, review_posts, mailing_address";

async function loadProject(admin: SupabaseClient, projectId: string) {
  const { data } = await admin
    .from("projects")
    .select(
      "id, title, genre, blurb, cover_path, metadata, updated_at, user_id, arc_open, arc_deadline, arc_collect_address, arc_review_links"
    )
    .eq("id", projectId)
    .maybeSingle();
  return data;
}

async function findArcInvite(
  admin: SupabaseClient,
  projectId: string,
  user: Pick<User, "id" | "email">
): Promise<ArcInviteRow | null> {
  const { data: byUser } = await admin
    .from("arc_invites")
    .select(INVITE_FIELDS)
    .eq("project_id", projectId)
    .eq("reader_user_id", user.id)
    .maybeSingle();
  if (byUser) return byUser as ArcInviteRow;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  const { data: byEmail } = await admin
    .from("arc_invites")
    .select(INVITE_FIELDS)
    .eq("project_id", projectId)
    .eq("email", email)
    .maybeSingle();
  if (!byEmail) return null;
  if (!byEmail.reader_user_id) {
    await admin.from("arc_invites").update({ reader_user_id: user.id }).eq("id", byEmail.id);
  }
  return { ...(byEmail as ArcInviteRow), reader_user_id: user.id };
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const admin = createServiceClient();
  const project = await loadProject(admin, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authorStudio = await userHasStudio(project.user_id);
  const windowOpen = authorStudio && isArcWindowOpen(project);
  const { data: author } = await admin
    .from("profiles")
    .select("display_name, public_links")
    .eq("id", project.user_id)
    .maybeSingle();

  const base = {
    projectId: project.id,
    title: project.title,
    genre: genreLabel(project.genre),
    blurb: String(project.blurb || "").trim(),
    coverUrl: coverPublicUrl(
      projectCoverPath(project),
      project.updated_at ? Date.parse(project.updated_at) : undefined
    ),
    authorUserId: project.user_id,
    authorName: author?.display_name || "Author",
    authorLinks: publicLinkList(normalizePublicLinks(author?.public_links)),
    trust: await trustBadgesForBook(admin, project.user_id, project.id),
    deadline: project.arc_deadline,
    windowOpen,
    deadlinePassed: isArcDeadlinePassed(project.arc_deadline),
  };

  if (!user) return NextResponse.json({ ...base, loggedIn: false, access: "login_required" });

  const subscribed = await isSubscribed(admin, { authorUserId: project.user_id, email: user.email });
  const withUser = { ...base, loggedIn: true, email: user.email || null, subscribed, canSubscribe: authorStudio };

  if (user.id === project.user_id) {
    return NextResponse.json({ ...withUser, access: "author" });
  }

  const invite = await findArcInvite(admin, projectId, user);
  if (!invite || invite.status === "denied" || invite.status === "revoked") {
    if (invite) {
      return NextResponse.json({
        ...withUser,
        access: "removed",
        message:
          invite.status === "denied"
            ? "The author didn't approve this ARC request."
            : "Your ARC access was removed by the author.",
      });
    }
    return NextResponse.json({ ...withUser, access: windowOpen ? "request" : "closed" });
  }
  if (invite.status === "requested") {
    return NextResponse.json({ ...withUser, access: "pending" });
  }

  // Active reader
  await joinAuthorAudience(admin, {
    authorUserId: project.user_id,
    email: invite.email,
    displayName: invite.display_name,
    readerUserId: user.id,
    source: "arc",
  });

  const reader = {
    inviteId: invite.id,
    displayName: invite.display_name,
    finishedAt: invite.finished_at,
    reviewBody: invite.review_body || "",
    reviewPosts: invite.review_posts || {},
    reviewLinks: normalizeReviewLinks(project.arc_review_links).map((l) => ({
      ...l,
      key: reviewSiteKey(l),
    })),
    collectAddress: Boolean(project.arc_collect_address),
    mailingAddress: normalizeMailingAddress(invite.mailing_address),
  };

  if (!windowOpen) {
    return NextResponse.json({ ...withUser, ...reader, access: "ended" });
  }

  const { data: chapters } = await admin
    .from("chapters")
    .select("id, title, content_html, sort_order")
    .eq("project_id", projectId)
    .order("sort_order");

  return NextResponse.json({
    ...withUser,
    ...reader,
    access: "active",
    currentChapterId: invite.current_chapter_id || chapters?.[0]?.id || null,
    chapters: (chapters || []).map((c) => ({
      id: c.id,
      title: c.title,
      content_html: c.content_html,
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    action?: "request" | "progress" | "finish" | "markPosted" | "saveAddress";
    displayName?: string;
    chapterId?: string;
    review?: string;
    site?: string;
    posted?: boolean;
    address?: unknown;
  };

  const admin = createServiceClient();
  const project = await loadProject(admin, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const windowOpen = (await userHasStudio(project.user_id)) && isArcWindowOpen(project);
  const invite = await findArcInvite(admin, projectId, user);

  if (body.action === "request") {
    if (!windowOpen) {
      return NextResponse.json({ error: "This book isn't taking ARC requests right now." }, { status: 403 });
    }
    if (user.id === project.user_id) {
      return NextResponse.json({ error: "This is your own book." }, { status: 400 });
    }
    if (invite) {
      return NextResponse.json({ error: "You already have a request or copy for this book." }, { status: 400 });
    }
    const email = String(user.email || "").trim().toLowerCase();
    const { error } = await admin.from("arc_invites").insert({
      project_id: projectId,
      user_id: project.user_id,
      email,
      display_name: sanitizeDisplayName(body.displayName) || null,
      reader_user_id: user.id,
      status: "requested",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabase
      .from("profiles")
      .update({ is_beta_reader: true, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    return NextResponse.json({ ok: true, access: "pending" });
  }

  if (!invite || invite.status !== "active") {
    return NextResponse.json({ error: "No ARC access" }, { status: 403 });
  }

  if (body.action === "markPosted") {
    const links = normalizeReviewLinks(project.arc_review_links);
    const site = String(body.site || "");
    if (!links.some((l) => reviewSiteKey(l) === site)) {
      return NextResponse.json({ error: "Unknown review site" }, { status: 400 });
    }
    const posts = { ...(invite.review_posts || {}) };
    if (body.posted) posts[site] = new Date().toISOString();
    else delete posts[site];
    await admin.from("arc_invites").update({ review_posts: posts }).eq("id", invite.id);
    return NextResponse.json({ ok: true, reviewPosts: posts });
  }

  if (body.action === "saveAddress") {
    if (!project.arc_collect_address) {
      return NextResponse.json({ error: "The author isn't collecting addresses for this book." }, { status: 400 });
    }
    if (body.address === null) {
      await admin.from("arc_invites").update({ mailing_address: null }).eq("id", invite.id);
      return NextResponse.json({ ok: true, mailingAddress: null });
    }
    const address = normalizeMailingAddress(body.address);
    if (!address) {
      return NextResponse.json(
        { error: "Name, street, city, and country are required." },
        { status: 400 }
      );
    }
    await admin.from("arc_invites").update({ mailing_address: address }).eq("id", invite.id);
    return NextResponse.json({ ok: true, mailingAddress: address });
  }

  if (body.action === "finish") {
    const now = new Date().toISOString();
    const review = String(body.review || "").trim().slice(0, 8000) || null;
    await admin
      .from("arc_invites")
      .update({ finished_at: invite.finished_at || now, review_body: review })
      .eq("id", invite.id);
    return NextResponse.json({ ok: true, finishedAt: invite.finished_at || now, reviewBody: review });
  }

  // progress
  if (!windowOpen) return NextResponse.json({ error: "The ARC window has ended." }, { status: 403 });
  if (!body.chapterId) return NextResponse.json({ error: "chapterId required" }, { status: 400 });
  await admin
    .from("arc_invites")
    .update({ current_chapter_id: body.chapterId, last_read_at: new Date().toISOString() })
    .eq("id", invite.id);
  return NextResponse.json({ ok: true });
}

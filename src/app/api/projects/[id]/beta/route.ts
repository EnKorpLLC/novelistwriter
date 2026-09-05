import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/stripe";
import { normalizeBetaApplicationForm } from "@/lib/beta-form";
import {
  normalizeBetaAutoApprove,
  sanitizeDisplayName,
} from "@/lib/beta-access";
import { enforceBetaExpiry, upsertBetaContact } from "@/lib/beta-server";
import { computeReaderStats, notifyAuthorFollowersOfReady } from "@/lib/beta-social";
import { userHasStudio } from "@/lib/credits";

async function requireProject(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, beta_application_form, beta_auto_approve, beta_expires_at, beta_ready")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return {
      error: NextResponse.json({ error: migrationHint(error.message) }, { status: 500 }),
    };
  }
  if (!project) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { supabase, user, project };
}

function studioRequiredResponse() {
  return NextResponse.json(
    {
      error: "Beta reader tools are included with Studio. Upgrade on the Billing page.",
      code: "studio_required",
      studioAccess: false,
    },
    { status: 403 }
  );
}

function migrationHint(message: string) {
  if (
    message.includes("beta_ready") ||
    message.includes("parent_id") ||
    message.includes("author_user_id") ||
    message.includes("beta_comment_reactions")
  ) {
    return "Database needs an update. Run supabase/migration_beta_platform.sql in the Supabase SQL editor.";
  }
  if (
    message.includes("display_name") ||
    message.includes("status_reason") ||
    message.includes("last_read_at") ||
    message.includes("beta_expires_at") ||
    message.includes("beta_auto_approve") ||
    message.includes("beta_contacts")
  ) {
    return "Database needs an update. Run supabase/migration_beta_access.sql in the Supabase SQL editor.";
  }
  return message;
}

function bookShareLink(projectId: string) {
  return appUrl(`/beta/book/${projectId}`);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const auth = await requireProject(projectId);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, user, project } = auth;

  const studioAccess = await userHasStudio(user.id);
  if (!studioAccess) {
    // Drop from public catalog if a free/pro account had marked ready
    if (project.beta_ready) {
      await supabase
        .from("projects")
        .update({ beta_ready: false, updated_at: new Date().toISOString() })
        .eq("id", projectId)
        .eq("user_id", user.id);
    }
    return NextResponse.json({
      studioAccess: false,
      betaReady: false,
      shareLink: null,
      applyLink: null,
      applicationForm: { intro: "", contentWarnings: "", fields: [] },
      autoApprove: { mode: "off", match: "all", rules: [] },
      expiresAt: null,
      periodEnded: false,
      chapters: [],
      contacts: [],
      invites: [],
      comments: [],
      error: "Beta reader tools are included with Studio. Upgrade on the Billing page.",
      code: "studio_required",
    });
  }

  await enforceBetaExpiry(supabase, project);

  const [
    { data: invites },
    { data: comments, error: commentsError },
    { data: chapters },
    { data: progress },
    { data: contacts, error: contactsError },
  ] = await Promise.all([
    supabase
      .from("beta_invites")
      .select(
        "id, email, token, status, created_at, application_answers, dnf_reason, dnf_at, current_chapter_id, display_name, status_reason, last_read_at, reader_user_id, finished_at"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("beta_comments")
      .select(
        "id, body, excerpt, chapter_id, invite_id, parent_id, author_user_id, completed, created_at"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("chapters")
      .select("id, title, sort_order")
      .eq("project_id", projectId)
      .order("sort_order"),
    supabase
      .from("beta_reading_progress")
      .select("invite_id, chapter_id, percent, updated_at")
      .eq("project_id", projectId),
    supabase
      .from("beta_contacts")
      .select("id, email, display_name, created_at, updated_at")
      .eq("project_id", projectId)
      .order("email"),
  ]);

  if (commentsError) {
    if (commentsError.message.includes("completed")) {
      return NextResponse.json(
        {
          error:
            "Database needs an update. Run supabase/migration_beta_comments.sql in the Supabase SQL editor.",
        },
        { status: 500 }
      );
    }
    if (
      commentsError.message.includes("parent_id") ||
      commentsError.message.includes("author_user_id")
    ) {
      return NextResponse.json({ error: migrationHint(commentsError.message) }, { status: 500 });
    }
    return NextResponse.json({ error: commentsError.message }, { status: 500 });
  }
  if (contactsError) {
    return NextResponse.json({ error: migrationHint(contactsError.message) }, { status: 500 });
  }

  const commentIds = (comments || []).map((c) => c.id);
  const { data: reactions, error: reactionsError } = commentIds.length
    ? await supabase
        .from("beta_comment_reactions")
        .select("comment_id, emoji, user_id")
        .in("comment_id", commentIds)
    : { data: [] as { comment_id: string; emoji: string; user_id: string }[], error: null };

  if (reactionsError?.message?.includes("beta_comment_reactions")) {
    return NextResponse.json({ error: migrationHint(reactionsError.message) }, { status: 500 });
  }

  const reactionsByComment = new Map<string, { emoji: string; userId: string }[]>();
  for (const r of reactions || []) {
    const list = reactionsByComment.get(r.comment_id) || [];
    list.push({ emoji: r.emoji, userId: r.user_id });
    reactionsByComment.set(r.comment_id, list);
  }

  const commentCountByInvite = new Map<string, number>();
  for (const c of comments || []) {
    if (!c.invite_id) continue;
    commentCountByInvite.set(c.invite_id, (commentCountByInvite.get(c.invite_id) || 0) + 1);
  }

  const inviteIds = [
    ...new Set((comments || []).map((c) => c.invite_id).filter(Boolean)),
  ] as string[];
  const { data: commentInvites } = inviteIds.length
    ? await supabase
        .from("beta_invites")
        .select("id, email, display_name")
        .in("id", inviteIds)
    : { data: [] as { id: string; email: string; display_name: string | null }[] };

  const chapterTitle = new Map((chapters || []).map((c) => [c.id, c.title]));
  const chapterOrder = new Map((chapters || []).map((c) => [c.id, c.sort_order]));
  const inviteEmail = new Map((commentInvites || []).map((i) => [i.id, i.email]));
  const inviteName = new Map((commentInvites || []).map((i) => [i.id, i.display_name]));

  const progressByInvite = new Map<
    string,
    { chapterId: string; title: string; percent: number; sortOrder: number }[]
  >();
  for (const row of progress || []) {
    const list = progressByInvite.get(row.invite_id) || [];
    list.push({
      chapterId: row.chapter_id,
      title: chapterTitle.get(row.chapter_id) || "Chapter",
      percent: row.percent,
      sortOrder: chapterOrder.get(row.chapter_id) ?? 9999,
    });
    progressByInvite.set(row.invite_id, list);
  }
  for (const list of progressByInvite.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const shareLink = bookShareLink(projectId);
  const applicationForm = normalizeBetaApplicationForm(project.beta_application_form);
  const autoApprove = normalizeBetaAutoApprove(project.beta_auto_approve);

  const emails = [
    ...new Set(
      (invites || [])
        .map((i) => String(i.email || "").trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ];
  const statsByEmail = new Map<string, ReturnType<typeof computeReaderStats>>();
  const reviewCountByEmail = new Map<string, number>();
  const avgRatingByEmail = new Map<string, number | null>();

  if (emails.length) {
    try {
      const admin = createServiceClient();
      const { data: allInvites } = await admin
        .from("beta_invites")
        .select("email, project_id, status, finished_at")
        .in("email", emails);
      const byEmailProjects = new Map<
        string,
        { status: string; finished_at: string | null; project_id: string }[]
      >();
      for (const row of allInvites || []) {
        const e = String(row.email || "")
          .trim()
          .toLowerCase();
        const list = byEmailProjects.get(e) || [];
        if (!list.some((x) => x.project_id === row.project_id)) {
          list.push({
            status: row.status,
            finished_at: row.finished_at,
            project_id: row.project_id,
          });
        }
        byEmailProjects.set(e, list);
      }
      for (const [e, rows] of byEmailProjects) {
        statsByEmail.set(e, computeReaderStats(rows));
      }

      const { data: reviews } = await admin
        .from("beta_reader_reviews")
        .select("reader_email, rating")
        .in("reader_email", emails);
      const ratingBuckets = new Map<string, number[]>();
      for (const r of reviews || []) {
        const e = String(r.reader_email || "")
          .trim()
          .toLowerCase();
        reviewCountByEmail.set(e, (reviewCountByEmail.get(e) || 0) + 1);
        if (r.rating != null) {
          const list = ratingBuckets.get(e) || [];
          list.push(r.rating);
          ratingBuckets.set(e, list);
        }
      }
      for (const [e, ratings] of ratingBuckets) {
        avgRatingByEmail.set(
          e,
          ratings.length
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : null
        );
      }
    } catch {
      /* social migration may not be applied yet */
    }
  }

  return NextResponse.json({
    studioAccess: true,
    betaReady: Boolean(project.beta_ready),
    shareLink,
    applyLink: appUrl(`/beta/apply/${projectId}`),
    applicationForm,
    autoApprove,
    expiresAt: project.beta_expires_at || null,
    periodEnded: Boolean(
      project.beta_expires_at && new Date(project.beta_expires_at).getTime() <= Date.now()
    ),
    chapters: chapters || [],
    contacts: (contacts || []).map((c) => ({
      id: c.id,
      email: c.email,
      displayName: c.display_name,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
    invites: (invites || []).map((i) => {
      const chapterProgress = progressByInvite.get(i.id) || [];
      const furthest = chapterProgress.reduce<{
        sortOrder: number;
        percent: number;
      } | null>((best, p) => {
        if (!best) return { sortOrder: p.sortOrder, percent: p.percent };
        if (p.sortOrder > best.sortOrder) return { sortOrder: p.sortOrder, percent: p.percent };
        if (p.sortOrder === best.sortOrder && p.percent > best.percent) {
          return { sortOrder: p.sortOrder, percent: p.percent };
        }
        return best;
      }, null);
      const currentId = i.current_chapter_id as string | null;
      const current =
        (currentId && chapterProgress.find((p) => p.chapterId === currentId)) ||
        [...chapterProgress].sort((a, b) => b.percent - a.percent)[0] ||
        null;
      const canShare =
        i.status !== "requested" && i.status !== "denied" && i.status !== "revoked";
      const emailKey = String(i.email || "")
        .trim()
        .toLowerCase();
      const stats = statsByEmail.get(emailKey) || { finished: 0, dnf: 0, reading: 0 };
      return {
        ...i,
        displayName: i.display_name,
        statusReason: i.status_reason,
        lastReadAt: i.last_read_at,
        readerUserId: (i as { reader_user_id?: string | null }).reader_user_id ?? null,
        commentCount: commentCountByInvite.get(i.id) || 0,
        furthestSortOrder: furthest?.sortOrder ?? -1,
        furthestPercent: furthest?.percent ?? 0,
        link: canShare ? shareLink : null,
        legacyLink: canShare ? appUrl(`/beta/${i.token}`) : null,
        applicationAnswers: i.application_answers || {},
        dnfReason: i.dnf_reason,
        dnfAt: i.dnf_at,
        chapterProgress,
        readerStats: stats,
        reviewCount: reviewCountByEmail.get(emailKey) || 0,
        avgRating: avgRatingByEmail.get(emailKey) ?? null,
        currentChapter: current
          ? {
              id: current.chapterId,
              title: current.title,
              percent: current.percent,
            }
          : currentId
            ? {
                id: currentId,
                title: chapterTitle.get(currentId) || "Chapter",
                percent: 0,
              }
            : null,
      };
    }),
    comments: (comments || []).map((c) => ({
      id: c.id,
      body: c.body,
      excerpt: c.excerpt,
      chapterId: c.chapter_id,
      chapterTitle: c.chapter_id ? chapterTitle.get(c.chapter_id) || "Chapter" : null,
      chapterOrder: c.chapter_id != null ? (chapterOrder.get(c.chapter_id) ?? 9999) : -1,
      inviteId: c.invite_id,
      parentId: c.parent_id || null,
      authorUserId: c.author_user_id || null,
      readerEmail: c.invite_id ? inviteEmail.get(c.invite_id) || null : null,
      readerName: c.invite_id ? inviteName.get(c.invite_id) || null : null,
      completed: Boolean(c.completed),
      createdAt: c.created_at,
      reactions: reactionsByComment.get(c.id) || [],
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const auth = await requireProject(projectId);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, user, project } = auth;

  if (!(await userHasStudio(user.id))) return studioRequiredResponse();

  const body = await req.json();

  if (body?.action === "setReady") {
    const betaReady = Boolean(body.betaReady);
    const wasReady = Boolean(project.beta_ready);

    const { data: projectRow } = await supabase
      .from("projects")
      .select("id, title")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { error } = await supabase
      .from("projects")
      .update({
        beta_ready: betaReady,
        beta_ready_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("user_id", user.id);
    if (error) {
      if (error.message.includes("beta_ready")) {
        return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (betaReady && !wasReady) {
      try {
        const admin = createServiceClient();
        const { count } = await admin
          .from("beta_invites")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId);
        const { data: author } = await admin
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();
        await notifyAuthorFollowersOfReady(admin, {
          authorUserId: user.id,
          authorName: author?.display_name || "An author",
          projectId,
          projectTitle: projectRow?.title || "a manuscript",
          rerelease: (count || 0) > 0,
        });
      } catch {
        /* non-fatal */
      }
    }

    return NextResponse.json({ ok: true, betaReady });
  }

  if (body?.action === "saveForm") {
    const applicationForm = normalizeBetaApplicationForm({
      intro: body.intro,
      contentWarnings: body.contentWarnings,
      fields: body.fields,
    });
    const { error } = await supabase
      .from("projects")
      .update({
        beta_application_form: applicationForm,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("user_id", user.id);
    if (error) {
      if (error.message.includes("beta_application_form")) {
        return NextResponse.json(
          {
            error:
              "Database needs an update. Run supabase/migration_beta_form.sql in the Supabase SQL editor.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, applicationForm });
  }

  if (body?.action === "saveAccessSettings") {
    const autoApprove = normalizeBetaAutoApprove(body.autoApprove);
    let expiresAt: string | null = null;
    if (body.expiresAt) {
      const d = new Date(String(body.expiresAt));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid expiration date" }, { status: 400 });
      }
      expiresAt = d.toISOString();
    }
    const { error } = await supabase
      .from("projects")
      .update({
        beta_auto_approve: autoApprove,
        beta_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
    if (expiresAt) await enforceBetaExpiry(supabase, { id: projectId, beta_expires_at: expiresAt });
    return NextResponse.json({ ok: true, autoApprove, expiresAt });
  }

  if (body?.action === "deleteContact") {
    const contactId = String(body.contactId || "");
    if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });
    const { error } = await supabase
      .from("beta_contacts")
      .delete()
      .eq("id", contactId)
      .eq("project_id", projectId);
    if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const trimmed = String(body.email || "")
    .trim()
    .toLowerCase();
  const displayName = sanitizeDisplayName(body.displayName);
  if (!trimmed || !trimmed.includes("@")) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  await upsertBetaContact(supabase, {
    projectId,
    userId: user.id,
    email: trimmed,
    displayName,
  });

  const { data: existing } = await supabase
    .from("beta_invites")
    .select("id, status, token")
    .eq("project_id", projectId)
    .ilike("email", trimmed)
    .maybeSingle();

  if (existing) {
    if (existing.status === "revoked" || existing.status === "denied" || existing.status === "dnf") {
      const { data, error } = await supabase
        .from("beta_invites")
        .update({
          status: "pending",
          email: trimmed,
          display_name: displayName || undefined,
          dnf_reason: null,
          dnf_at: null,
          status_reason: null,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
      return NextResponse.json({
        invite: data,
        link: bookShareLink(projectId),
        legacyLink: appUrl(`/beta/${data.token}`),
      });
    }
    return NextResponse.json({
      invite: existing,
      link: bookShareLink(projectId),
      legacyLink: appUrl(`/beta/${existing.token}`),
      error: "That email is already on the list.",
    });
  }

  const { data, error } = await supabase
    .from("beta_invites")
    .insert({
      project_id: projectId,
      user_id: user.id,
      email: trimmed,
      display_name: displayName || null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });

  return NextResponse.json({
    invite: data,
    link: bookShareLink(projectId),
    legacyLink: appUrl(`/beta/${data.token}`),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const auth = await requireProject(projectId);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!(await userHasStudio(user.id))) return studioRequiredResponse();

  const body = (await req.json()) as {
    inviteId?: string;
    commentId?: string;
    reason?: string;
    action?: "approve" | "deny" | "remove" | "complete" | "uncomplete" | "delete";
  };

  if (body.commentId && body.action) {
    if (body.action === "delete") {
      const { error } = await supabase
        .from("beta_comments")
        .delete()
        .eq("id", body.commentId)
        .eq("project_id", projectId);
      if (error) {
        if (error.message.includes("policy") || error.message.includes("permission")) {
          return NextResponse.json(
            {
              error:
                "Database needs an update. Run supabase/migration_beta_comments.sql in the Supabase SQL editor.",
            },
            { status: 500 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: body.commentId });
    }

    if (body.action === "complete" || body.action === "uncomplete") {
      const { data, error } = await supabase
        .from("beta_comments")
        .update({ completed: body.action === "complete" })
        .eq("id", body.commentId)
        .eq("project_id", projectId)
        .select("id, completed")
        .maybeSingle();
      if (error) {
        if (error.message.includes("completed") || error.message.includes("policy")) {
          return NextResponse.json(
            {
              error:
                "Database needs an update. Run supabase/migration_beta_comments.sql in the Supabase SQL editor.",
            },
            { status: 500 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, comment: data });
    }

    return NextResponse.json({ error: "Invalid comment action" }, { status: 400 });
  }

  const { inviteId, action } = body;
  if (!inviteId || !action) {
    return NextResponse.json({ error: "inviteId and action required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "deny" && action !== "remove") {
    return NextResponse.json({ error: "Invalid invite action" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
  if ((action === "deny" || action === "remove") && !reason) {
    return NextResponse.json({ error: "A reason is required" }, { status: 400 });
  }

  const status =
    action === "approve" ? "pending" : action === "deny" ? "denied" : "revoked";

  const { data, error } = await supabase
    .from("beta_invites")
    .update({
      status,
      status_reason: action === "approve" ? null : reason,
    })
    .eq("id", inviteId)
    .eq("project_id", projectId)
    .select("id, email, token, status, status_reason, display_name")
    .single();

  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    invite: data,
    link: status === "pending" ? bookShareLink(projectId) : null,
    legacyLink: status === "pending" ? appUrl(`/beta/${data.token}`) : null,
  });
}

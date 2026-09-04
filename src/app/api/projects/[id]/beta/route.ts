import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/stripe";
import { normalizeBetaApplicationForm } from "@/lib/beta-form";
import {
  normalizeBetaAutoApprove,
  sanitizeDisplayName,
  BETA_PERIOD_ENDED_REASON,
} from "@/lib/beta-access";
import { enforceBetaExpiry, upsertBetaContact } from "@/lib/beta-server";

async function requireProject(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: project } = await supabase
    .from("projects")
    .select("id, beta_application_form, beta_auto_approve, beta_expires_at")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { supabase, user, project };
}

function migrationHint(message: string) {
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const auth = await requireProject(projectId);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, project } = auth;

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
        "id, email, token, status, created_at, application_answers, dnf_reason, dnf_at, current_chapter_id, display_name, status_reason, last_read_at"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("beta_comments")
      .select("id, body, excerpt, chapter_id, invite_id, completed, created_at")
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

  if (commentsError?.message?.includes("completed")) {
    return NextResponse.json(
      {
        error:
          "Database needs an update. Run supabase/migration_beta_comments.sql in the Supabase SQL editor.",
      },
      { status: 500 }
    );
  }
  if (contactsError) {
    return NextResponse.json({ error: migrationHint(contactsError.message) }, { status: 500 });
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

  const applicationForm = normalizeBetaApplicationForm(project.beta_application_form);
  const autoApprove = normalizeBetaAutoApprove(project.beta_auto_approve);

  return NextResponse.json({
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
      const currentId = i.current_chapter_id as string | null;
      const current =
        (currentId && chapterProgress.find((p) => p.chapterId === currentId)) ||
        [...chapterProgress].sort((a, b) => b.percent - a.percent)[0] ||
        null;
      return {
        ...i,
        displayName: i.display_name,
        statusReason: i.status_reason,
        lastReadAt: i.last_read_at,
        link:
          i.status === "requested" || i.status === "denied" || i.status === "revoked"
            ? null
            : appUrl(`/beta/${i.token}`),
        applicationAnswers: i.application_answers || {},
        dnfReason: i.dnf_reason,
        dnfAt: i.dnf_at,
        chapterProgress,
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
      readerEmail: c.invite_id ? inviteEmail.get(c.invite_id) || null : null,
      readerName: c.invite_id ? inviteName.get(c.invite_id) || null : null,
      completed: Boolean(c.completed),
      createdAt: c.created_at,
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
  const { supabase, user } = auth;

  const body = await req.json();

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
      return NextResponse.json({ invite: data, link: appUrl(`/beta/${data.token}`) });
    }
    return NextResponse.json({
      invite: existing,
      link: appUrl(`/beta/${existing.token}`),
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
    link: appUrl(`/beta/${data.token}`),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const auth = await requireProject(projectId);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase } = auth;

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
    link: status === "pending" ? appUrl(`/beta/${data.token}`) : null,
  });
}

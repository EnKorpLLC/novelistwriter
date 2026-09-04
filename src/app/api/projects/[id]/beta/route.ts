import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/stripe";
import { normalizeBetaApplicationForm } from "@/lib/beta-form";

async function requireProject(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: project } = await supabase
    .from("projects")
    .select("id, beta_application_form")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { supabase, user, project };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const auth = await requireProject(projectId);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, project } = auth;

  const [
    { data: invites },
    { data: comments, error: commentsError },
    { data: chapters },
    { data: progress },
  ] =
    await Promise.all([
      supabase
        .from("beta_invites")
        .select(
          "id, email, token, status, created_at, application_answers, dnf_reason, dnf_at, current_chapter_id"
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

  const inviteIds = [
    ...new Set((comments || []).map((c) => c.invite_id).filter(Boolean)),
  ] as string[];
  const { data: commentInvites } = inviteIds.length
    ? await supabase.from("beta_invites").select("id, email").in("id", inviteIds)
    : { data: [] as { id: string; email: string }[] };

  const chapterTitle = new Map((chapters || []).map((c) => [c.id, c.title]));
  const chapterOrder = new Map((chapters || []).map((c) => [c.id, c.sort_order]));
  const inviteEmail = new Map((commentInvites || []).map((i) => [i.id, i.email]));

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

  return NextResponse.json({
    applyLink: appUrl(`/beta/apply/${projectId}`),
    applicationForm,
    chapters: chapters || [],
    invites: (invites || []).map((i) => {
      const chapterProgress = progressByInvite.get(i.id) || [];
      const currentId = i.current_chapter_id as string | null;
      const current =
        (currentId && chapterProgress.find((p) => p.chapterId === currentId)) ||
        [...chapterProgress].sort((a, b) => b.percent - a.percent)[0] ||
        null;
      return {
        ...i,
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

  const trimmed = String(body.email || "")
    .trim()
    .toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

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
          dnf_reason: null,
          dnf_at: null,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
      status: "pending",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  const status =
    action === "approve" ? "pending" : action === "deny" ? "denied" : "revoked";

  const { data, error } = await supabase
    .from("beta_invites")
    .update({ status })
    .eq("id", inviteId)
    .eq("project_id", projectId)
    .select("id, email, token, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    invite: data,
    link: status === "pending" ? appUrl(`/beta/${data.token}`) : null,
  });
}

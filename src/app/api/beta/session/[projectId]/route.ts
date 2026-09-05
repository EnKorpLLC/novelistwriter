import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { accessMessageForStatus } from "@/lib/beta-access";
import {
  missingRequiredAnswers,
  normalizeBetaApplicationForm,
  sanitizeApplicationAnswers,
} from "@/lib/beta-form";
import { linkInvitesForEmail } from "@/lib/beta-platform";
import {
  enforceBetaAccessGates,
  findReaderInvite,
  inviteAllowsReading,
  upsertBetaContact,
} from "@/lib/beta-server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const url = new URL(req.url);
  const chapterId = url.searchParams.get("chapter");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  await linkInvitesForEmail(admin, user.id, user.email);

  const { data: project } = await admin
    .from("projects")
    .select("id, title, user_id, beta_application_form, beta_expires_at, beta_ready")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const gate = await enforceBetaAccessGates(admin, project);
  if (gate.blocked) {
    const blocked = accessMessageForStatus("revoked", gate.reason);
    return NextResponse.json(blocked, { status: 403 });
  }

  const invite = await findReaderInvite(admin, {
    projectId,
    userId: user.id,
    email: user.email,
  });

  if (!inviteAllowsReading(invite)) {
    return NextResponse.json(
      { error: "No access", code: "no_access", redirect: `/beta/book/${projectId}` },
      { status: 403 }
    );
  }

  const form = normalizeBetaApplicationForm(project.beta_application_form);
  const answers = sanitizeApplicationAnswers(form.fields, invite!.application_answers);
  const needsApplication =
    form.fields.length > 0 && missingRequiredAnswers(form.fields, answers).length > 0;

  if (needsApplication) {
    return NextResponse.json({
      ok: false,
      needsApplication: true,
      form,
      title: project.title,
      inviteId: invite!.id,
      status: invite!.status,
    });
  }

  const { data: chapters } = await admin
    .from("chapters")
    .select("id, title, content_html, sort_order")
    .eq("project_id", projectId)
    .order("sort_order");

  const { data: progress } = await admin
    .from("beta_reading_progress")
    .select("chapter_id, percent")
    .eq("invite_id", invite!.id);

  const { data: review } = await admin
    .from("beta_book_reviews")
    .select("id, body")
    .eq("project_id", projectId)
    .eq("invite_id", invite!.id)
    .maybeSingle();

  let resumeChapterId = chapterId || invite!.current_chapter_id;
  if (!resumeChapterId && progress?.length) {
    const byOrder = new Map((chapters || []).map((c) => [c.id, c.sort_order]));
    const best = [...progress].sort((a, b) => {
      const ao = byOrder.get(a.chapter_id) ?? 9999;
      const bo = byOrder.get(b.chapter_id) ?? 9999;
      if (ao !== bo) return bo - ao;
      return b.percent - a.percent;
    })[0];
    resumeChapterId = best?.chapter_id || null;
  }

  return NextResponse.json({
    ok: true,
    title: project.title,
    inviteId: invite!.id,
    status: invite!.status,
    finishedAt: invite!.finished_at,
    hasReview: Boolean(review),
    reviewBody: review?.body || null,
    currentChapterId: resumeChapterId || chapters?.[0]?.id || null,
    progress: Object.fromEntries((progress || []).map((p) => [p.chapter_id, p.percent])),
    chapters: (chapters || []).map((c) => ({
      id: c.id,
      title: c.title,
      content_html: c.content_html,
      sort_order: c.sort_order,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    action?: "progress" | "complete_application" | "finish";
    chapterId?: string;
    percent?: number;
    answers?: Record<string, string>;
    displayName?: string;
    review?: string;
  };

  const admin = createServiceClient();
  await linkInvitesForEmail(admin, user.id, user.email);

  const { data: project } = await admin
    .from("projects")
    .select("id, user_id, beta_application_form, beta_expires_at, beta_ready")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const gate = await enforceBetaAccessGates(admin, project);
  if (gate.blocked) {
    return NextResponse.json(
      { error: gate.reason, code: "removed", reason: gate.reason },
      { status: 403 }
    );
  }

  const invite = await findReaderInvite(admin, {
    projectId,
    userId: user.id,
    email: user.email,
  });
  if (!inviteAllowsReading(invite)) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  if (body.action === "complete_application") {
    const form = normalizeBetaApplicationForm(project.beta_application_form);
    const sanitized = sanitizeApplicationAnswers(form.fields, body.answers || {});
    const missing = missingRequiredAnswers(form.fields, sanitized);
    if (missing.length) {
      return NextResponse.json({ error: "Please complete required questions." }, { status: 400 });
    }
    const displayName = String(body.displayName || invite!.display_name || "").trim().slice(0, 80);
    await admin
      .from("beta_invites")
      .update({
        application_answers: sanitized,
        reader_user_id: user.id,
        ...(displayName ? { display_name: displayName } : {}),
      })
      .eq("id", invite!.id);
    await upsertBetaContact(admin, {
      projectId,
      userId: project.user_id,
      email: invite!.email,
      displayName: displayName || invite!.display_name,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "finish") {
    const review = String(body.review || "").trim().slice(0, 8000);
    if (!review) {
      return NextResponse.json({ error: "Review required" }, { status: 400 });
    }
    const now = new Date().toISOString();
    await admin
      .from("beta_invites")
      .update({ finished_at: now, reader_user_id: user.id })
      .eq("id", invite!.id);

    const { error } = await admin.from("beta_book_reviews").upsert(
      {
        project_id: projectId,
        invite_id: invite!.id,
        reader_user_id: user.id,
        body: review,
      },
      { onConflict: "project_id,invite_id" }
    );
    if (error) {
      if (error.message.includes("beta_book_reviews")) {
        return NextResponse.json(
          {
            error:
              "Database needs an update. Run supabase/migration_beta_platform.sql in the Supabase SQL editor.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, finishedAt: now });
  }

  // progress
  if (!body.chapterId) {
    return NextResponse.json({ error: "chapterId required" }, { status: 400 });
  }
  if (invite!.status === "dnf") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const percent = Math.max(0, Math.min(100, Math.round(Number(body.percent) || 0)));
  const { error } = await admin.from("beta_reading_progress").upsert(
    {
      invite_id: invite!.id,
      project_id: projectId,
      chapter_id: body.chapterId,
      percent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "invite_id,chapter_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inviteUpdate: Record<string, unknown> = {
    current_chapter_id: body.chapterId,
    last_read_at: new Date().toISOString(),
    reader_user_id: user.id,
  };
  if (invite!.status === "pending") inviteUpdate.status = "accepted";
  await admin.from("beta_invites").update(inviteUpdate).eq("id", invite!.id);

  return NextResponse.json({ ok: true, percent });
}

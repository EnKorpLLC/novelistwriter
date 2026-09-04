import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  normalizeBetaAutoApprove,
  sanitizeDisplayName,
  shouldAutoApprove,
  BETA_PERIOD_ENDED_REASON,
} from "@/lib/beta-access";
import { enforceBetaExpiry, upsertBetaContact } from "@/lib/beta-server";
import {
  missingRequiredAnswers,
  normalizeBetaApplicationForm,
  sanitizeApplicationAnswers,
} from "@/lib/beta-form";

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = createServiceClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, title, beta_application_form, beta_auto_approve")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = normalizeBetaApplicationForm(project.beta_application_form);
  return NextResponse.json({
    title: project.title,
    form,
    // legacy alias
    fields: form.fields,
    autoApprove: normalizeBetaAutoApprove(project.beta_auto_approve),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    projectId?: string;
    email?: string;
    displayName?: string;
    answers?: Record<string, string>;
  };
  const trimmed = (body.email || "").trim().toLowerCase();
  const displayName = sanitizeDisplayName(body.displayName);
  if (!body.projectId || !trimmed || !trimmed.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, user_id, title, beta_application_form, beta_auto_approve, beta_expires_at")
    .eq("id", body.projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { expired } = await enforceBetaExpiry(admin, project);
  if (expired) {
    return NextResponse.json(
      { error: BETA_PERIOD_ENDED_REASON, code: "expired", message: BETA_PERIOD_ENDED_REASON },
      { status: 403 }
    );
  }

  const form = normalizeBetaApplicationForm(project.beta_application_form);
  const answers = sanitizeApplicationAnswers(form.fields, body.answers);
  const missing = missingRequiredAnswers(form.fields, answers);
  if (missing.length) {
    return NextResponse.json(
      { error: `Please answer: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const autoSettings = normalizeBetaAutoApprove(project.beta_auto_approve);
  const autoApproved = shouldAutoApprove(autoSettings, form.fields, answers);
  const status = autoApproved ? "pending" : "requested";

  const approvedMessage =
    "You're approved. Enter your email below to unlock the manuscript.";
  const reviewMessage =
    "Application submitted. Enter your email below to check your status.";

  const { data: existing } = await admin
    .from("beta_invites")
    .select("id, status")
    .eq("project_id", body.projectId)
    .ilike("email", trimmed)
    .maybeSingle();

  async function finish(finalStatus: string) {
    await upsertBetaContact(admin, {
      projectId: body.projectId!,
      userId: project!.user_id,
      email: trimmed,
      displayName,
    });
    const isPending = finalStatus === "pending";
    return NextResponse.json({
      ok: true,
      status: finalStatus,
      message: isPending ? approvedMessage : reviewMessage,
      unlockReady: true,
      autoApproved: isPending,
    });
  }

  if (existing) {
    if (existing.status === "denied" || existing.status === "revoked" || existing.status === "dnf") {
      const { error } = await admin
        .from("beta_invites")
        .update({
          status,
          email: trimmed,
          display_name: displayName,
          application_answers: answers,
          status_reason: null,
          dnf_reason: null,
          dnf_at: null,
        })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
      return finish(status);
    }
    if (existing.status === "requested") {
      const { error } = await admin
        .from("beta_invites")
        .update({
          status,
          application_answers: answers,
          email: trimmed,
          display_name: displayName,
          status_reason: null,
        })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
      return finish(status);
    }
    // Already pending / accepted — refresh contact info, keep access
    const { error } = await admin
      .from("beta_invites")
      .update({
        email: trimmed,
        display_name: displayName,
        application_answers: answers,
      })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
    return finish(existing.status === "accepted" ? "pending" : existing.status);
  }

  const { error } = await admin.from("beta_invites").insert({
    project_id: body.projectId,
    user_id: project.user_id,
    email: trimmed,
    display_name: displayName,
    status,
    application_answers: answers,
    status_reason: null,
  });

  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });

  return finish(status);
}

function migrationHint(message: string) {
  if (
    message.includes("application_answers") ||
    message.includes("beta_application_form") ||
    message.includes("dnf") ||
    message.includes("status") ||
    message.includes("display_name") ||
    message.includes("status_reason") ||
    message.includes("beta_auto_approve") ||
    message.includes("beta_contacts")
  ) {
    return "This project’s database needs an update. Run supabase/migration_beta_access.sql in the Supabase SQL editor.";
  }
  return message;
}

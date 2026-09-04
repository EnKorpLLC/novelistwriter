import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
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
    .select("id, title, beta_application_form")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = normalizeBetaApplicationForm(project.beta_application_form);
  return NextResponse.json({
    title: project.title,
    form,
    // legacy alias
    fields: form.fields,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    projectId?: string;
    email?: string;
    answers?: Record<string, string>;
  };
  const trimmed = (body.email || "").trim().toLowerCase();
  if (!body.projectId || !trimmed || !trimmed.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, user_id, title, beta_application_form")
    .eq("id", body.projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = normalizeBetaApplicationForm(project.beta_application_form);
  const answers = sanitizeApplicationAnswers(form.fields, body.answers);
  const missing = missingRequiredAnswers(form.fields, answers);
  if (missing.length) {
    return NextResponse.json(
      { error: `Please answer: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const { data: existing } = await admin
    .from("beta_invites")
    .select("id, status")
    .eq("project_id", body.projectId)
    .ilike("email", trimmed)
    .maybeSingle();

  if (existing) {
    if (existing.status === "denied" || existing.status === "revoked" || existing.status === "dnf") {
      const { error } = await admin
        .from("beta_invites")
        .update({
          status: "requested",
          email: trimmed,
          application_answers: answers,
          dnf_reason: null,
          dnf_at: null,
        })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
      return NextResponse.json({ ok: true, message: "Request sent. The author will review it." });
    }
    if (existing.status === "requested") {
      const { error } = await admin
        .from("beta_invites")
        .update({ application_answers: answers, email: trimmed })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
      return NextResponse.json({
        ok: true,
        message: "Application updated. The author still has your request.",
      });
    }
    return NextResponse.json({
      ok: true,
      message: "You’re already on the list. Wait for the author to send your reading link.",
    });
  }

  const { error } = await admin.from("beta_invites").insert({
    project_id: body.projectId,
    user_id: project.user_id,
    email: trimmed,
    status: "requested",
    application_answers: answers,
  });

  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });

  return NextResponse.json({ ok: true, message: "Request sent. The author will review it." });
}

function migrationHint(message: string) {
  if (
    message.includes("application_answers") ||
    message.includes("beta_application_form") ||
    message.includes("dnf") ||
    message.includes("status")
  ) {
    return "This project’s database needs an update. Run supabase/migration_beta_form.sql in the Supabase SQL editor.";
  }
  return message;
}

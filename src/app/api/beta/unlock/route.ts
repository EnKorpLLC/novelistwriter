import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  missingRequiredAnswers,
  normalizeBetaApplicationForm,
  sanitizeApplicationAnswers,
} from "@/lib/beta-form";

function emailsMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function needsApplicationAnswers(
  fields: ReturnType<typeof normalizeBetaApplicationForm>["fields"],
  answers: unknown
) {
  if (!fields.length) return false;
  const sanitized = sanitizeApplicationAnswers(fields, answers);
  return missingRequiredAnswers(fields, sanitized).length > 0;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    token?: string;
    email?: string;
    answers?: Record<string, string>;
  };
  const token = String(body.token || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!token || !email || !email.includes("@")) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: invite } = await admin
    .from("beta_invites")
    .select("id, email, status, project_id, application_answers")
    .eq("token", token)
    .maybeSingle();

  if (
    !invite ||
    (invite.status !== "pending" && invite.status !== "accepted" && invite.status !== "dnf")
  ) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }

  if (!emailsMatch(invite.email, email)) {
    return NextResponse.json(
      { error: "That email doesn’t match this reading invite." },
      { status: 403 }
    );
  }

  const { data: project } = await admin
    .from("projects")
    .select("id, beta_application_form")
    .eq("id", invite.project_id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = normalizeBetaApplicationForm(project.beta_application_form);
  let answers = invite.application_answers;
  const stillNeedsForm = needsApplicationAnswers(form.fields, answers);

  if (stillNeedsForm) {
    const submitted = sanitizeApplicationAnswers(form.fields, body.answers);
    const missing = missingRequiredAnswers(form.fields, submitted);
    if (missing.length) {
      return NextResponse.json(
        {
          error: `Please answer: ${missing.join(", ")}`,
          needsApplication: true,
        },
        { status: 400 }
      );
    }
    answers = submitted;
    const { error } = await admin
      .from("beta_invites")
      .update({
        application_answers: answers,
        status: invite.status === "pending" ? "accepted" : invite.status,
      })
      .eq("id", invite.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (invite.status === "pending") {
    await admin.from("beta_invites").update({ status: "accepted" }).eq("id", invite.id);
  }

  const { data: chapters } = await admin
    .from("chapters")
    .select("id, title, content_html, sort_order")
    .eq("project_id", invite.project_id)
    .order("sort_order");

  return NextResponse.json({
    ok: true,
    status: invite.status === "dnf" ? "dnf" : "accepted",
    chapters: chapters || [],
    needsApplication: false,
  });
}

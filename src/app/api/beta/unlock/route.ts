import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  accessMessageForStatus,
  sanitizeDisplayName,
} from "@/lib/beta-access";
import { enforceBetaAccessGates, upsertBetaContact } from "@/lib/beta-server";
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
    displayName?: string;
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
    .select("id, email, status, status_reason, display_name, project_id, application_answers, user_id")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
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
    .select("id, user_id, beta_application_form, beta_expires_at, beta_ready")
    .eq("id", invite.project_id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const gate = await enforceBetaAccessGates(admin, project);
  if (gate.blocked) {
    const blocked = accessMessageForStatus("revoked", gate.reason);
    return NextResponse.json(blocked, { status: 403 });
  }

  const { data: freshInvite } = await admin
    .from("beta_invites")
    .select("id, email, status, status_reason, display_name, project_id, application_answers, user_id")
    .eq("id", invite.id)
    .maybeSingle();
  const current = freshInvite || invite;

  if (
    current.status === "requested" ||
    current.status === "denied" ||
    current.status === "revoked"
  ) {
    const blocked = accessMessageForStatus(current.status, current.status_reason);
    return NextResponse.json(blocked, { status: 403 });
  }

  if (
    current.status !== "pending" &&
    current.status !== "accepted" &&
    current.status !== "dnf"
  ) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }

  const form = normalizeBetaApplicationForm(project.beta_application_form);
  let answers = current.application_answers;
  const stillNeedsForm = needsApplicationAnswers(form.fields, answers);
  const displayName = sanitizeDisplayName(body.displayName);

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
    const updatePayload: Record<string, unknown> = {
      application_answers: answers,
      status: current.status === "pending" ? "accepted" : current.status,
      last_read_at: new Date().toISOString(),
    };
    if (displayName) updatePayload.display_name = displayName;
    const { error } = await admin
      .from("beta_invites")
      .update(updatePayload)
      .eq("id", current.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (current.status === "pending") {
    await admin
      .from("beta_invites")
      .update({
        status: "accepted",
        last_read_at: new Date().toISOString(),
        ...(displayName ? { display_name: displayName } : {}),
      })
      .eq("id", current.id);
  } else {
    await admin
      .from("beta_invites")
      .update({ last_read_at: new Date().toISOString() })
      .eq("id", current.id);
  }

  await upsertBetaContact(admin, {
    projectId: current.project_id,
    userId: project.user_id || current.user_id,
    email,
    displayName: displayName || current.display_name,
  });

  const { data: chapters } = await admin
    .from("chapters")
    .select("id, title, content_html, sort_order")
    .eq("project_id", current.project_id)
    .order("sort_order");

  return NextResponse.json({
    ok: true,
    status: current.status === "dnf" ? "dnf" : "accepted",
    chapters: chapters || [],
    needsApplication: false,
  });
}

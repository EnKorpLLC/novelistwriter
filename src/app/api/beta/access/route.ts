import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { accessMessageForStatus, BETA_PERIOD_ENDED_REASON } from "@/lib/beta-access";
import { enforceBetaExpiry } from "@/lib/beta-server";
import { appUrl } from "@/lib/stripe";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    projectId?: string;
    email?: string;
  };
  const projectId = String(body.projectId || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!projectId || !email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const admin = createServiceClient();

  const { data: project } = await admin
    .from("projects")
    .select("id, beta_expires_at")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let { data: invite } = await admin
    .from("beta_invites")
    .select("id, token, status, status_reason, email")
    .eq("project_id", projectId)
    .ilike("email", email)
    .maybeSingle();

  const { expired } = await enforceBetaExpiry(admin, project);
  if (expired) {
    if (invite) {
      const { data: refreshed } = await admin
        .from("beta_invites")
        .select("id, token, status, status_reason, email")
        .eq("id", invite.id)
        .maybeSingle();
      invite = refreshed;
    }
    if (!invite) {
      return NextResponse.json({
        code: "unknown",
        message: "No application found for that email.",
      });
    }
    const blocked = accessMessageForStatus("revoked", BETA_PERIOD_ENDED_REASON);
    return NextResponse.json(blocked);
  }

  if (!invite) {
    return NextResponse.json({
      code: "unknown",
      message: "No application found for that email.",
    });
  }

  if (
    invite.status === "requested" ||
    invite.status === "denied" ||
    invite.status === "revoked"
  ) {
    return NextResponse.json(
      accessMessageForStatus(invite.status, invite.status_reason)
    );
  }

  if (
    invite.status === "pending" ||
    invite.status === "accepted" ||
    invite.status === "dnf"
  ) {
    return NextResponse.json({
      code: "ok",
      token: invite.token,
      readUrl: appUrl(`/beta/${invite.token}`),
    });
  }

  return NextResponse.json(
    accessMessageForStatus(invite.status, invite.status_reason)
  );
}

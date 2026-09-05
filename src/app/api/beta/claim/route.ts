import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/stripe";

/** Resolve a legacy invite token into a claim/login destination (no manuscript unlock). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const admin = createServiceClient();
  const { data: invite } = await admin
    .from("beta_invites")
    .select("id, email, display_name, project_id, status, token")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const { data: project } = await admin
    .from("projects")
    .select("id, title")
    .eq("id", invite.project_id)
    .maybeSingle();

  const email = invite.email.trim().toLowerCase();
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  return NextResponse.json({
    email,
    displayName: invite.display_name,
    projectId: invite.project_id,
    projectTitle: project?.title || "Manuscript",
    status: invite.status,
    hasAccount: Boolean(existingProfile),
    nextPath: `/beta/dashboard`,
    bookPath: `/beta/book/${invite.project_id}`,
    loginUrl: appUrl(`/login?next=${encodeURIComponent("/beta/dashboard")}&email=${encodeURIComponent(email)}`),
    signupUrl: appUrl(
      `/beta/signup?email=${encodeURIComponent(email)}&name=${encodeURIComponent(invite.display_name || "")}&next=${encodeURIComponent("/beta/dashboard")}`
    ),
  });
}

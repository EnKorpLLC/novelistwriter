import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { token, projectId, reason } = (await req.json()) as {
    token?: string;
    projectId?: string;
    reason?: string;
  };
  if (!token || !projectId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const why = String(reason || "").trim().slice(0, 4000);
  if (!why) {
    return NextResponse.json({ error: "Please say why you’re marking this DNF." }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: invite } = await admin
    .from("beta_invites")
    .select("id, status")
    .eq("token", token)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!invite || (invite.status !== "pending" && invite.status !== "accepted" && invite.status !== "dnf")) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 403 });
  }

  const { error } = await admin
    .from("beta_invites")
    .update({
      status: "dnf",
      dnf_reason: why,
      dnf_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message.includes("dnf") || error.message.includes("status")
            ? "Database needs an update. Run supabase/migration_beta_form.sql in Supabase."
            : error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

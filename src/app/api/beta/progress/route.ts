import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { enforceBetaAccessGates } from "@/lib/beta-server";

async function loadInvite(token: string, projectId: string) {
  const admin = createServiceClient();
  const { data: invite } = await admin
    .from("beta_invites")
    .select("*")
    .eq("token", token)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!invite) return { admin, invite: null as null };
  const ok =
    invite.status === "pending" || invite.status === "accepted" || invite.status === "dnf";
  return { admin, invite: ok ? invite : null };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const projectId = url.searchParams.get("projectId");
  if (!token || !projectId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { invite } = await loadInvite(token, projectId);
  if (!invite) return NextResponse.json({ error: "Invalid invite" }, { status: 403 });

  const admin = createServiceClient();
  const { data: progress } = await admin
    .from("beta_reading_progress")
    .select("chapter_id, percent")
    .eq("invite_id", invite.id);

  return NextResponse.json({
    status: invite.status,
    dnfReason: invite.dnf_reason,
    currentChapterId: invite.current_chapter_id,
    progress: Object.fromEntries((progress || []).map((p) => [p.chapter_id, p.percent])),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    token?: string;
    projectId?: string;
    chapterId?: string;
    percent?: number;
  };
  if (!body.token || !body.projectId || !body.chapterId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const percent = Math.max(0, Math.min(100, Math.round(Number(body.percent) || 0)));

  const admin = createServiceClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, beta_expires_at, beta_ready")
    .eq("id", body.projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const gate = await enforceBetaAccessGates(admin, project);
  if (gate.blocked) {
    return NextResponse.json(
      {
        error: gate.reason,
        code: "removed",
        message: gate.reason,
        reason: gate.reason,
      },
      { status: 403 }
    );
  }

  const { invite } = await loadInvite(body.token, body.projectId);
  if (!invite) return NextResponse.json({ error: "Invalid invite" }, { status: 403 });
  if (invite.status === "dnf") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { error } = await admin.from("beta_reading_progress").upsert(
    {
      invite_id: invite.id,
      project_id: body.projectId,
      chapter_id: body.chapterId,
      percent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "invite_id,chapter_id" }
  );
  if (error) {
    return NextResponse.json(
      {
        error: error.message.includes("beta_reading_progress")
          ? "Database needs an update. Run supabase/migration_beta_form.sql in Supabase."
          : error.message,
      },
      { status: 500 }
    );
  }

  const inviteUpdate: Record<string, unknown> = {
    current_chapter_id: body.chapterId,
    last_read_at: new Date().toISOString(),
  };
  if (invite.status === "pending") {
    inviteUpdate.status = "accepted";
  }

  await admin.from("beta_invites").update(inviteUpdate).eq("id", invite.id);

  return NextResponse.json({ ok: true, percent });
}

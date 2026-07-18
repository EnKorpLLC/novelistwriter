import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { token, projectId, chapterId, body } = await req.json();
  if (!token || !projectId || !body) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: invite } = await admin
    .from("beta_invites")
    .select("*")
    .eq("token", token)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!invite || invite.status === "revoked") {
    return NextResponse.json({ error: "Invalid invite" }, { status: 403 });
  }

  await admin.from("beta_invites").update({ status: "accepted" }).eq("id", invite.id);

  const { error } = await admin.from("beta_comments").insert({
    project_id: projectId,
    chapter_id: chapterId || null,
    invite_id: invite.id,
    body,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

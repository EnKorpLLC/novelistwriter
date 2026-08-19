import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { projectId, email } = (await req.json()) as { projectId?: string; email?: string };
  const trimmed = (email || "").trim().toLowerCase();
  if (!projectId || !trimmed || !trimmed.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, user_id, title")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: existing } = await admin
    .from("beta_invites")
    .select("id, status")
    .eq("project_id", projectId)
    .ilike("email", trimmed)
    .maybeSingle();

  if (existing) {
    if (existing.status === "denied" || existing.status === "revoked") {
      await admin
        .from("beta_invites")
        .update({ status: "requested", email: trimmed })
        .eq("id", existing.id);
      return NextResponse.json({ ok: true, message: "Request sent. The author will review it." });
    }
    if (existing.status === "requested") {
      return NextResponse.json({ ok: true, message: "You already requested to read this book." });
    }
    return NextResponse.json({
      ok: true,
      message: "You’re already on the list. Wait for the author to send your reading link.",
    });
  }

  const { error } = await admin.from("beta_invites").insert({
    project_id: projectId,
    user_id: project.user_id,
    email: trimmed,
    status: "requested",
  });

  if (error) {
    if (error.message.includes("requested") || error.message.includes("status")) {
      return NextResponse.json(
        {
          error:
            "This project’s database needs the beta status update. Run supabase/migration_beta.sql in Supabase SQL editor.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Request sent. The author will review it." });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { inviteToLaunchTeam, removeFromTeam, removeReader, ROSTER_HINT } from "@/lib/reader-roster";

/**
 * Reader list actions for one of the author's books:
 * { action: "invite_team", projectId, email, displayName? }
 * { action: "remove", kind: "beta" | "arc", projectId, email }
 * { action: "remove_team", projectId, userId, email? }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; kind?: string; projectId?: string; email?: string; displayName?: string; userId?: string };
  const projectId = String(b.projectId || "");
  const admin = createServiceClient();
  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  if (b.action === "invite_team") {
    const r = await inviteToLaunchTeam(admin, { projectId, authorUserId: user.id, email: String(b.email || ""), displayName: b.displayName || null });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "remove" && (b.kind === "beta" || b.kind === "arc")) {
    try {
      await removeReader(admin, { kind: b.kind, projectId, email: String(b.email || "") });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't delete";
      return NextResponse.json({ error: /column|relation/.test(message) ? ROSTER_HINT : message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  if (b.action === "remove_team" && b.userId) {
    await removeFromTeam(admin, { projectId, userId: b.userId, email: b.email });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

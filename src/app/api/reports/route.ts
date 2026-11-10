import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { REPORTS_PER_DAY, SAFETY_MIGRATION_HINT } from "@/lib/reader-safety";

const KINDS = ["ai_concern", "conduct", "content"];

/** A private report to Novelist Writer about a book or someone's conduct. Conduct reports need an account. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const body = (await req.json().catch(() => ({}))) as { kind?: string; reason?: string; details?: string; projectId?: string; targetUserId?: string; email?: string };
  const kind = KINDS.includes(String(body.kind)) ? String(body.kind) : "content";
  if (kind === "conduct" && !user) return NextResponse.json({ error: "Log in to report someone's conduct." }, { status: 401 });
  const reason = String(body.reason || "").trim().slice(0, 200);
  if (!reason) return NextResponse.json({ error: "Pick a reason." }, { status: 400 });

  const admin = createServiceClient();
  let projectId: string | null = null;
  let targetUserId: string | null = body.targetUserId ? String(body.targetUserId) : null;
  if (body.projectId) {
    const { data: p } = await admin.from("projects").select("id, user_id").eq("id", String(body.projectId)).maybeSingle();
    if (p) {
      projectId = p.id;
      targetUserId = p.user_id;
    }
  }
  if (!projectId && !targetUserId) return NextResponse.json({ error: "Nothing to report." }, { status: 400 });
  if (user && targetUserId === user.id) return NextResponse.json({ error: "That's your own book." }, { status: 400 });

  // A few per person per day, so reports stay meaningful
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const hdrs = await headers();
  const guestKey = createHash("sha256").update(`${(hdrs.get("x-forwarded-for") || "").split(",")[0]}|${hdrs.get("user-agent") || ""}`).digest("hex").slice(0, 24);
  const email = user?.email || (String(body.email || "").includes("@") ? String(body.email).trim().slice(0, 200) : null);
  const { count, error: countErr } = user
    ? await admin.from("trust_reports").select("id", { count: "exact", head: true }).eq("reporter_user_id", user.id).gte("created_at", since)
    : await admin.from("trust_reports").select("id", { count: "exact", head: true }).eq("reporter_email", `guest:${guestKey}`).gte("created_at", since);
  if (countErr) return NextResponse.json({ error: /trust_reports/.test(countErr.message) ? SAFETY_MIGRATION_HINT : countErr.message }, { status: 500 });
  if ((count || 0) >= REPORTS_PER_DAY) return NextResponse.json({ error: "You've sent several reports today. We'll get to them; try again tomorrow if there's more." }, { status: 429 });

  const { error } = await admin.from("trust_reports").insert({
    kind,
    reporter_user_id: user?.id || null,
    reporter_email: user ? email : email || `guest:${guestKey}`,
    project_id: projectId,
    target_user_id: targetUserId,
    reason,
    details: String(body.details || "").trim().slice(0, 2000),
  });
  if (error) return NextResponse.json({ error: /trust_reports/.test(error.message) ? SAFETY_MIGRATION_HINT : error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

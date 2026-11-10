import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { requestGuestConfirmation, upsertAuthorSubscriber } from "@/lib/audience";
import { sourceLabel } from "@/lib/traffic-source";

/** Anyone can join an author's list from a launch page or author site; guests confirm by email. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    authorUserId?: string;
    email?: string;
    name?: string;
    company?: string;
    releaseProjectId?: string;
    cameFrom?: { utm_source?: string; referrer_host?: string } | null;
  };
  if (body.company) return NextResponse.json({ ok: true, status: "check_email" });

  const authorUserId = String(body.authorUserId || "");
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const name = String(body.name || "").trim().slice(0, 80) || null;
  if (!authorUserId || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const cameFrom = body.cameFrom && typeof body.cameFrom === "object" ? sourceLabel(body.cameFrom)?.slice(0, 80) || null : null;
  const admin = createServiceClient();
  if (!(await userHasStudio(authorUserId))) {
    return NextResponse.json({ error: "This author isn't collecting an email list right now." }, { status: 400 });
  }
  // Only this author's own books can be followed for a release email
  let releaseProjectId: string | null = null;
  if (body.releaseProjectId) {
    const { data: p } = await admin.from("projects").select("id").eq("id", String(body.releaseProjectId)).eq("user_id", authorUserId).maybeSingle();
    releaseProjectId = p?.id || null;
  }

  // A signed-in reader joining with their own email needs no confirmation
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email && user.email.trim().toLowerCase() === email) {
    await upsertAuthorSubscriber(admin, { authorUserId, email, displayName: name, source: "opt_in", releaseProjectId, cameFrom });
    return NextResponse.json({ ok: true, status: "subscribed" });
  }

  const result = await requestGuestConfirmation(admin, { authorUserId, email, name, cameFrom, releaseProjectId });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.http });
  if (result.status === "already") return NextResponse.json({ ok: true, status: releaseProjectId ? "subscribed" : "already" });
  return NextResponse.json({ ok: true, status: "check_email" });
}

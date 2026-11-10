import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { requestGuestConfirmation, upsertAuthorSubscriber } from "@/lib/audience";
import { sourceLabel } from "@/lib/traffic-source";
import { SALES_MIGRATION_HINT, deliverMagnet } from "@/lib/direct-sales";
import { normalizeDirectSale } from "@/lib/direct-sale-rules";

/**
 * Reader magnet: join the author's list, get the book free. Guests confirm their email first;
 * signed-in readers using their own email get it right away.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    email?: string;
    name?: string;
    company?: string;
    cameFrom?: { utm_source?: string; referrer_host?: string } | null;
  };
  if (body.company) return NextResponse.json({ ok: true, status: "check_email" });
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const name = String(body.name || "").trim().slice(0, 80) || null;
  if (!email.includes("@")) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });

  const admin = createServiceClient();
  const { data: project } = await admin.from("projects").select("id, user_id, title, published, launch_public, direct_sale").eq("id", String(body.projectId || "")).maybeSingle();
  if (!project || !normalizeDirectSale(project.direct_sale).magnet || !(project.published || project.launch_public)) {
    return NextResponse.json({ error: "This book isn't free right now." }, { status: 400 });
  }
  if (!(await userHasStudio(project.user_id))) return NextResponse.json({ error: "This book isn't free right now." }, { status: 400 });
  const cameFrom = body.cameFrom && typeof body.cameFrom === "object" ? sourceLabel(body.cameFrom)?.slice(0, 80) || null : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  try {
    if (user?.email && user.email.trim().toLowerCase() === email) {
      await upsertAuthorSubscriber(admin, { authorUserId: project.user_id, email, displayName: name, source: "opt_in", cameFrom });
      const d = await deliverMagnet(admin, { projectId: project.id, authorId: project.user_id, email, name: name || "" });
      return NextResponse.json({ ok: true, status: "delivered", downloadUrl: d.downloadUrl });
    }
    const { error } = await admin.from("magnet_claims").upsert({ project_id: project.id, author_user_id: project.user_id, email, name: name || "", status: "pending" }, { onConflict: "project_id,email", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: SALES_MIGRATION_HINT }, { status: 500 });
    const result = await requestGuestConfirmation(admin, { authorUserId: project.user_id, email, name, cameFrom, freeBookTitle: project.title || "the book" });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.http });
    // Already on the list: no need to confirm again, the book goes straight to their inbox
    if (result.status === "already") await deliverMagnet(admin, { projectId: project.id, authorId: project.user_id, email, name: name || "" });
    return NextResponse.json({ ok: true, status: "check_email" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
  }
}

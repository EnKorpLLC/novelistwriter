import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { FEEDBACK_BUCKET, feedbackLabel } from "@/lib/site-feedback";

const STATUSES = ["new", "read", "archived"] as const;

export async function GET(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const status = new URL(req.url).searchParams.get("status") || "open";
  const query = (cols: string) => {
    let q = auth.admin.from("platform_messages").select(cols).order("created_at", { ascending: false }).limit(200);
    if (status === "open") q = q.in("status", ["new", "read"]);
    else if ((STATUSES as readonly string[]).includes(status)) q = q.eq("status", status);
    return q;
  };
  const base = "id, name, email, subject, body, user_id, status, created_at";
  // Feedback columns arrive with migration_site_feedback.sql; the inbox works without them
  let res = await query(`${base}, kind, page, attachments`);
  if (res.error) res = await query(base);
  const { data: rows, error } = res;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const data = (rows || []) as unknown as Record<string, unknown>[];

  // Screenshots are private; the inbox gets links that work for an hour
  const paths = data.flatMap((m) => (Array.isArray(m.attachments) ? (m.attachments as string[]) : []));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await auth.admin.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 3600);
    for (const u of urls || []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  const { count } = await auth.admin
    .from("platform_messages")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  return NextResponse.json({
    unread: count || 0,
    messages: data.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      subject: m.subject,
      body: m.body,
      userId: m.user_id,
      status: m.status,
      createdAt: m.created_at,
      kind: feedbackLabel(m.kind as string | null),
      page: (m.page as string | null) || null,
      screenshots: (Array.isArray(m.attachments) ? (m.attachments as string[]) : []).map((p) => signed.get(p)).filter(Boolean),
    })),
  });
}

export async function PATCH(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { id?: string; status?: string };
  if (!body.id || !(STATUSES as readonly string[]).includes(String(body.status))) {
    return NextResponse.json({ error: "id and a valid status required" }, { status: 400 });
  }
  const { error } = await auth.admin
    .from("platform_messages")
    .update({ status: body.status })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

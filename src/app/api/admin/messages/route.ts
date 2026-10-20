import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";

const STATUSES = ["new", "read", "archived"] as const;

export async function GET(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const status = new URL(req.url).searchParams.get("status") || "open";
  let q = auth.admin
    .from("platform_messages")
    .select("id, name, email, subject, body, user_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "open") q = q.in("status", ["new", "read"]);
  else if ((STATUSES as readonly string[]).includes(status)) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await auth.admin
    .from("platform_messages")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  return NextResponse.json({
    unread: count || 0,
    messages: (data || []).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      subject: m.subject,
      body: m.body,
      userId: m.user_id,
      status: m.status,
      createdAt: m.created_at,
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

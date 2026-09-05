import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("beta_notifications")
    .select("id, type, title, body, href, meta, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  }

  const unread = (data || []).filter((n) => !n.read_at).length;
  return NextResponse.json({
    unread,
    notifications: (data || []).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      href: n.href,
      meta: n.meta,
      readAt: n.read_at,
      createdAt: n.created_at,
    })),
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { ids?: string[]; all?: boolean };
  const admin = createServiceClient();
  const now = new Date().toISOString();

  if (body.all) {
    await admin
      .from("beta_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
    return NextResponse.json({ ok: true });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

  await admin
    .from("beta_notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .in("id", ids);

  return NextResponse.json({ ok: true });
}

function migrationHint(message: string) {
  if (message.includes("beta_notifications")) {
    return "Database needs an update. Run supabase/migration_beta_social.sql in the Supabase SQL editor.";
  }
  return message;
}

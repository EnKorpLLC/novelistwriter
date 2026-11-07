import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MATTER_TYPES } from "@/lib/matter";

async function owner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return data ? { supabase, user } : null;
}

/** Add a front or back matter page. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { matter_type?: string; title?: string };
  const def = MATTER_TYPES.find((t) => t.type === body.matter_type);
  if (!def) return NextResponse.json({ error: "Unknown page type" }, { status: 400 });
  const { data: last } = await auth.supabase
    .from("matter_blocks")
    .select("sort_order")
    .eq("project_id", id)
    .like("matter_type", def.type.startsWith("front_") ? "front_%" : "back_%")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await auth.supabase
    .from("matter_blocks")
    .insert({
      project_id: id,
      user_id: auth.user.id,
      matter_type: def.type,
      title: String(body.title || def.label).slice(0, 120),
      content_html: "<p></p>",
      enabled: true,
      sort_order: (last?.sort_order ?? (def.type.startsWith("front_") ? 0 : 10)) + 1,
    })
    .select("*")
    .single();
  if (error) {
    const hint = error.message.includes("matter_type_check")
      ? "Database needs an update. Run supabase/migration_formatting.sql in the Supabase SQL editor."
      : error.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  return NextResponse.json({ matter: data });
}

/** Save a new order: ids listed front to back. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { order?: string[] };
  const order = Array.isArray(body.order) ? body.order.slice(0, 100) : [];
  for (let i = 0; i < order.length; i++) {
    await auth.supabase.from("matter_blocks").update({ sort_order: i }).eq("id", order[i]).eq("project_id", id);
  }
  return NextResponse.json({ ok: true });
}

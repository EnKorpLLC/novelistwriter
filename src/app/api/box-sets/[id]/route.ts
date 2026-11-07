import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BOOK_STYLES } from "@/lib/book/styles";

const MAX_BOOKS = 12;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200);
  if (typeof body.subtitle === "string") patch.subtitle = body.subtitle.trim().slice(0, 200);
  if (typeof body.style === "string" && BOOK_STYLES.some((s) => s.id === body.style)) patch.style = body.style;
  if ("cover_path" in body) {
    const p = body.cover_path;
    patch.cover_path = typeof p === "string" && p.startsWith(`${user.id}/`) && !p.includes("..") ? p.slice(0, 300) : null;
  }
  if (Array.isArray(body.project_ids)) {
    const wanted = body.project_ids.map(String).slice(0, MAX_BOOKS);
    const { data: owned } = await supabase.from("projects").select("id").eq("user_id", user.id).in("id", wanted.length ? wanted : [id]);
    const ok = new Set((owned || []).map((p) => p.id));
    patch.project_ids = [...new Set(wanted.filter((p) => ok.has(p)))];
  }

  const { data, error } = await supabase.from("box_sets").update(patch).eq("id", id).eq("user_id", user.id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ set: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("box_sets").select("cover_path").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (data?.cover_path) await supabase.storage.from("covers").remove([data.cover_path]);
  await supabase.from("box_sets").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { projectLockedMessage } from "@/lib/studio-access";
import { normalizeDetails, normalizeFormat } from "@/lib/book/format";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lockMsg = await projectLockedMessage(supabase, id);
  if (lockMsg) return NextResponse.json({ error: lockMsg, code: "project_locked" }, { status: 423 });

  const body = await req.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    "title",
    "subtitle",
    "genre",
    "pov",
    "status",
    "blurb",
    "metadata",
    "kdp_settings",
    "series_id",
  ]) {
    if (key in body) patch[key] = body[key];
  }
  if ("format_settings" in body) {
    // Merged onto what's stored: the Format tab, Cover tab, and print page each send only what they changed
    const { data: current } = await supabase.from("projects").select("format_settings").eq("id", id).eq("user_id", user.id).maybeSingle();
    const stored = current?.format_settings && typeof current.format_settings === "object" ? current.format_settings : {};
    const incoming = body.format_settings && typeof body.format_settings === "object" ? body.format_settings : {};
    patch.format_settings = normalizeFormat({ ...stored, ...incoming });
  }
  if ("book_details" in body) patch.book_details = normalizeDetails(body.book_details);

  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    const hint = /format_settings|book_details/.test(error.message)
      ? "Database needs an update. Run supabase/migration_formatting.sql in the Supabase SQL editor."
      : error.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  return NextResponse.json({ project: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cascades remove chapters, bible, matter via FK on delete
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

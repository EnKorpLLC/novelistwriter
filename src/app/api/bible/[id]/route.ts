import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const body = await req.json();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.summary === "string") patch.summary = body.summary;
  if (typeof body.speech_notes === "string") patch.speech_notes = body.speech_notes;
  if (typeof body.entry_type === "string") patch.entry_type = body.entry_type;

  if (Array.isArray(body.aliases) || (body.details && typeof body.details === "object")) {
    const { data: cur } = await supabase
      .from("bible_entries")
      .select("details")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    const details = {
      ...((cur?.details as Record<string, unknown>) || {}),
      ...(body.details && typeof body.details === "object" ? body.details : {}),
    };
    if (Array.isArray(body.aliases)) {
      details.aliases = body.aliases.map((a: unknown) => String(a).trim()).filter(Boolean);
    }
    patch.details = details;
  }

  const { data, error } = await supabase
    .from("bible_entries")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
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

  const { error } = await supabase
    .from("bible_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

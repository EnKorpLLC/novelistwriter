import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const aliases = Array.isArray(body.aliases)
    ? body.aliases.map((a: unknown) => String(a).trim()).filter(Boolean)
    : [];
  const { data, error } = await supabase
    .from("bible_entries")
    .insert({
      project_id: projectId,
      user_id: user.id,
      entry_type: body.entry_type,
      name: body.name,
      summary: body.summary || "",
      speech_notes: body.speech_notes || "",
      details: { ...(body.details || {}), ...(aliases.length ? { aliases } : {}) },
      series_id: body.series_id || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

/** Batch delete: { ids: string[] } or { deleteAll: true } */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { ids?: string[]; deleteAll?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.deleteAll) {
    const { error, count } = await supabase
      .from("bible_entries")
      .delete({ count: "exact" })
      .eq("project_id", projectId)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : [];
  if (!ids.length) {
    return NextResponse.json({ error: "Provide ids[] or deleteAll: true" }, { status: 400 });
  }

  const { error, count } = await supabase
    .from("bible_entries")
    .delete({ count: "exact" })
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? ids.length });
}

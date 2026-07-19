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

  // Batch delete via POST — Next.js often drops DELETE request bodies
  if (body?.action === "delete") {
    if (body.deleteAll) {
      const { error, count } = await supabase
        .from("bible_entries")
        .delete({ count: "exact" })
        .eq("project_id", projectId)
        .eq("user_id", user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, deleted: count ?? 0 });
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id: unknown) => typeof id === "string")
      : [];
    if (!ids.length) {
      return NextResponse.json({ error: "Provide ids[] or deleteAll: true" }, { status: 400 });
    }

    let deleted = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error, count } = await supabase
        .from("bible_entries")
        .delete({ count: "exact" })
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .in("id", chunk);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      deleted += count ?? chunk.length;
    }
    return NextResponse.json({ ok: true, deleted });
  }

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

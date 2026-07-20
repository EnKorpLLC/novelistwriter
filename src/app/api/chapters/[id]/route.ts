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
  const allowed = [
    "content_html",
    "content_text",
    "word_count",
    "title",
    "goal",
    "conflict",
    "outcome",
    "pov",
    "timeline_position",
    "summary",
  ];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const { data: before } = await supabase
    .from("chapters")
    .select("word_count")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("chapters")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: day } = await supabase
    .from("writing_days")
    .select("words_written")
    .eq("user_id", user.id)
    .eq("day", today)
    .maybeSingle();
  let wordsWrittenToday = day?.words_written ?? 0;

  if (typeof body.word_count === "number") {
    const delta = body.word_count - (before.word_count ?? 0);
    if (delta !== 0) {
      wordsWrittenToday = Math.max(0, wordsWrittenToday + delta);
      await supabase.from("writing_days").upsert({
        user_id: user.id,
        day: today,
        words_written: wordsWrittenToday,
      });
    }
  }

  return NextResponse.json({ chapter: data, wordsWrittenToday });
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

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, project_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!chapter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { count } = await supabase
    .from("chapters")
    .select("*", { count: "exact", head: true })
    .eq("project_id", chapter.project_id);

  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      { error: "Cannot delete the only chapter. Add another first." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("chapters")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

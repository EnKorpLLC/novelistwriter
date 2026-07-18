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

  const { data, error } = await supabase
    .from("chapters")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Track daily words (approximate: use word_count delta lightly)
  if (typeof body.word_count === "number") {
    const today = new Date().toISOString().slice(0, 10);
    const { data: day } = await supabase
      .from("writing_days")
      .select("words_written")
      .eq("user_id", user.id)
      .eq("day", today)
      .maybeSingle();
    // Store latest session contribution as bump — simple approach: max with current day
    const prev = day?.words_written ?? 0;
    const bump = Math.max(prev, Math.min(body.word_count, prev + 500));
    await supabase.from("writing_days").upsert({
      user_id: user.id,
      day: today,
      words_written: bump,
    });
  }

  return NextResponse.json({ chapter: data });
}

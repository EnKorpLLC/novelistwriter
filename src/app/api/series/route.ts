import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, projectId } = await req.json();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const { data: series, error } = await supabase
    .from("series")
    .insert({ user_id: user.id, title })
    .select("*")
    .single();

  if (error || !series) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }

  if (projectId) {
    await supabase
      .from("projects")
      .update({ series_id: series.id })
      .eq("id", projectId)
      .eq("user_id", user.id);

    // Share bible entries to series for series bible
    await supabase
      .from("bible_entries")
      .update({ series_id: series.id })
      .eq("project_id", projectId)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ series });
}

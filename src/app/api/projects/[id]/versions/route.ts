import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: chapters } = await supabase
    .from("chapters")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", user.id);

  const label = `Snapshot ${new Date().toISOString()}`;
  const rows = (chapters || []).map((c) => ({
    chapter_id: c.id,
    user_id: user.id,
    content_html: c.content_html,
    content_text: c.content_text,
    word_count: c.word_count,
    label,
  }));

  if (rows.length) {
    const { error } = await supabase.from("chapter_versions").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ count: rows.length, label });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", projectId);

  const ids = (chapters || []).map((c) => c.id);
  if (!ids.length) return NextResponse.json({ versions: [] });

  const { data } = await supabase
    .from("chapter_versions")
    .select("id, label, created_at, word_count, chapter_id")
    .in("chapter_id", ids)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ versions: data || [] });
}

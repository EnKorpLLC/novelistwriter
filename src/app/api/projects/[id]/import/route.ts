import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import mammoth from "mammoth";

function splitChapters(text: string): { title: string; body: string }[] {
  const parts = text.split(/\n(?=Chapter\s+\d+|CHAPTER\s+\d+|#\s+)/i);
  if (parts.length <= 1) {
    return [{ title: "Chapter 1", body: text.trim() }];
  }
  return parts
    .map((p, i) => {
      const lines = p.trim().split("\n");
      const title = lines[0]?.replace(/^#\s*/, "").trim() || `Chapter ${i + 1}`;
      const body = lines.slice(1).join("\n").trim();
      return { title, body };
    })
    .filter((c) => c.body || c.title);
}

function fountainToChapters(text: string): { title: string; body: string }[] {
  const scenes = text.split(/\n(?=\.[A-Z])/);
  if (scenes.length <= 1) return splitChapters(text);
  return scenes.map((s, i) => {
    const lines = s.trim().split("\n");
    return {
      title: lines[0]?.replace(/^\./, "").trim() || `Scene ${i + 1}`,
      body: lines.slice(1).join("\n").trim(),
    };
  });
}

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

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const kind = (form.get("kind") as string) || "docx";
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let chapters: { title: string; body: string }[] = [];

  if (kind === "fountain" || file.name.endsWith(".fountain")) {
    chapters = fountainToChapters(buf.toString("utf8"));
  } else if (kind === "scrivener") {
    // Best-effort: treat as plain/rtf-ish text
    const text = buf.toString("utf8").replace(/\{\\[^}]+\}/g, " ").replace(/\\[a-z]+\d*\s?/gi, " ");
    chapters = splitChapters(text);
  } else {
    const result = await mammoth.extractRawText({ buffer: buf });
    chapters = splitChapters(result.value);
  }

  // Replace existing empty chapter set if only default empty chapter
  const { data: existing } = await supabase
    .from("chapters")
    .select("id, word_count")
    .eq("project_id", projectId);

  const onlyEmpty =
    existing?.length === 1 && (existing[0].word_count === 0 || !existing[0].word_count);
  if (onlyEmpty && existing[0]) {
    await supabase.from("chapters").delete().eq("id", existing[0].id);
  }

  const rows = chapters.map((c, i) => ({
    project_id: projectId,
    user_id: user.id,
    title: c.title,
    sort_order: i,
    content_text: c.body,
    content_html: c.body
      .split(/\n\n+/)
      .map((p) => `<p>${p.replace(/</g, "&lt;")}</p>`)
      .join(""),
    word_count: c.body.trim() ? c.body.trim().split(/\s+/).length : 0,
  }));

  const { error } = await supabase.from("chapters").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ chapters: rows.length });
}

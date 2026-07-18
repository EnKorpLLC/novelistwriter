import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import mammoth from "mammoth";
import { parseNovelist2DocxText } from "@/lib/novelist2-docx";

function fountainToChapters(text: string): { title: string; body: string }[] {
  const scenes = text.split(/\n(?=\.[A-Z])/);
  if (scenes.length <= 1) {
    return [{ title: "Chapter 1", body: text.trim() }];
  }
  return scenes.map((s, i) => {
    const lines = s.trim().split("\n");
    return {
      title: lines[0]?.replace(/^\./, "").trim() || `Scene ${i + 1}`,
      body: lines.slice(1).join("\n").trim(),
    };
  });
}

function toRows(
  chapters: { title: string; body: string }[],
  projectId: string,
  userId: string
) {
  return chapters.map((c, i) => ({
    project_id: projectId,
    user_id: userId,
    title: c.title,
    sort_order: i,
    content_text: c.body,
    content_html: c.body
      .split(/\n\n+/)
      .map((p) => `<p>${p.replace(/</g, "&lt;")}</p>`)
      .join(""),
    word_count: c.body.trim() ? c.body.trim().split(/\s+/).length : 0,
  }));
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
  const replaceAll = form.get("replaceAll") === "1" || form.get("replaceAll") === "true";
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let chapters: { title: string; body: string }[] = [];
  let importedTitle: string | undefined;
  const name = file.name.toLowerCase();

  if (kind === "fountain" || name.endsWith(".fountain")) {
    chapters = fountainToChapters(buf.toString("utf8"));
  } else if (kind === "scrivener") {
    const text = buf
      .toString("utf8")
      .replace(/\{\\[^}]+\}/g, " ")
      .replace(/\\[a-z]+\d*\s?/gi, " ");
    const parsed = parseNovelist2DocxText(text);
    chapters = parsed.chapters;
    importedTitle = parsed.title;
  } else {
    // Novelist 2.0 / Word DOCX (Chapter N: Title)
    const result = await mammoth.extractRawText({ buffer: buf });
    const parsed = parseNovelist2DocxText(result.value);
    chapters = parsed.chapters;
    importedTitle = parsed.title;
  }

  if (!chapters.length) {
    return NextResponse.json(
      { error: "No chapters found. Expected Novelist 2.0 style headings like “Chapter 1: Title”." },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("chapters")
    .select("id, word_count")
    .eq("project_id", projectId);

  const onlyEmpty =
    existing?.length === 1 && (existing[0].word_count === 0 || !existing[0].word_count);

  if (replaceAll || onlyEmpty) {
    if (existing?.length) {
      await supabase.from("chapters").delete().eq("project_id", projectId).eq("user_id", user.id);
    }
  }

  const rows = toRows(chapters, projectId, user.id);
  const { error } = await supabase.from("chapters").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (importedTitle && importedTitle !== "Untitled Novel") {
    await supabase
      .from("projects")
      .update({ title: importedTitle, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("user_id", user.id);
  }

  return NextResponse.json({
    chapters: rows.length,
    title: importedTitle,
    format: "novelist2-docx",
  });
}

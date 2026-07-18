import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import mammoth from "mammoth";
import { parseNovelist2DocxText, plainToMatterHtml } from "@/lib/novelist2-docx";

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
  let frontMatter: { matter_type: string; title: string; content: string; enabled: boolean }[] =
    [];
  let backMatter: { matter_type: string; title: string; content: string; enabled: boolean }[] =
    [];
  const name = file.name.toLowerCase();

  if (kind === "fountain" || name.endsWith(".fountain")) {
    chapters = fountainToChapters(buf.toString("utf8"));
  } else {
    const result = await mammoth.extractRawText({ buffer: buf });
    const parsed = parseNovelist2DocxText(result.value);
    chapters = parsed.chapters;
    importedTitle = parsed.title;
    frontMatter = parsed.frontMatter;
    backMatter = parsed.backMatter;
  }

  if (!chapters.length) {
    return NextResponse.json(
      {
        error:
          "No chapters found. Expected Novelist 2.0 style headings like “Chapter 1: Title”.",
      },
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

  // Merge imported front/back matter into existing matter_blocks
  const imported = [...frontMatter, ...backMatter];
  let matterUpdated = 0;
  if (imported.length) {
    const { data: existingMatter } = await supabase
      .from("matter_blocks")
      .select("*")
      .eq("project_id", projectId);

    for (const block of imported) {
      const match = (existingMatter || []).find((m) => m.matter_type === block.matter_type);
      const html = plainToMatterHtml(block.content);
      if (match) {
        const { error: upErr } = await supabase
          .from("matter_blocks")
          .update({
            title: block.title,
            content_html: html,
            enabled: true,
          })
          .eq("id", match.id)
          .eq("user_id", user.id);
        if (!upErr) matterUpdated += 1;
      } else {
        const { error: insErr } = await supabase.from("matter_blocks").insert({
          project_id: projectId,
          user_id: user.id,
          matter_type: block.matter_type,
          title: block.title,
          content_html: html,
          enabled: true,
          sort_order: block.matter_type.startsWith("back_") ? 20 : 0,
        });
        if (!insErr) matterUpdated += 1;
      }
    }
  }

  return NextResponse.json({
    chapters: rows.length,
    title: importedTitle,
    matterUpdated,
    frontMatter: frontMatter.map((m) => m.title),
    backMatter: backMatter.map((m) => m.title),
    format: "novelist2-docx",
  });
}

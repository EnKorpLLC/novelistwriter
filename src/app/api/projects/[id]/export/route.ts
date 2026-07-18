import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exportDocx, exportEpub, validateEpubStructure } from "@/lib/export";

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

  const { format } = await req.json();

  const [{ data: project }, { data: chapters }, { data: matter }, { data: profile }] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).eq("user_id", user.id).single(),
      supabase.from("chapters").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("matter_blocks").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (format === "validate") {
    const result = validateEpubStructure(chapters || []);
    return NextResponse.json(result);
  }

  const authorName = profile?.display_name || user.email || "Author";
  const matterBlocks = (matter || []).map((m) => ({
    matter_type: m.matter_type,
    title: m.title,
    content_html: m.content_html,
    enabled: m.enabled,
    sort_order: m.sort_order,
  }));

  if (format === "docx") {
    const blob = await exportDocx({
      title: project.title,
      subtitle: project.subtitle,
      authorName,
      chapters: chapters || [],
      matter: matterBlocks,
    });
    const buf = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${project.title}.docx"`,
      },
    });
  }

  if (format === "epub") {
    const blob = await exportEpub({
      title: project.title,
      authorName,
      chapters: chapters || [],
      matter: matterBlocks,
    });
    const buf = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${project.title}.epub"`,
      },
    });
  }

  return NextResponse.json({ error: "Unknown format" }, { status: 400 });
}

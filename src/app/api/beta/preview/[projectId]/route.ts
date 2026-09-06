import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { genreLabel } from "@/lib/beta-platform";
import { catalogLabelsForProject } from "@/lib/book-keywords";
import { userHasStudio } from "@/lib/credits";

/**
 * Public sample of a beta-ready book: blurb + first chapter only.
 * Does not unlock the full manuscript.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const admin = createServiceClient();

  const { data: project } = await admin
    .from("projects")
    .select("id, title, genre, blurb, cover_path, updated_at, user_id, beta_ready, metadata")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authorHasStudio = await userHasStudio(project.user_id);
  if (!project.beta_ready || !authorHasStudio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: author }, { data: chapters }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", project.user_id).maybeSingle(),
    admin
      .from("chapters")
      .select("id, title, content_html, sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .limit(1),
  ]);

  const first = chapters?.[0] || null;
  const labels = catalogLabelsForProject(project);

  return NextResponse.json({
    projectId: project.id,
    title: project.title,
    blurb: project.blurb || "",
    genre: labels[0] || genreLabel(project.genre),
    keywords: labels,
    authorUserId: project.user_id,
    authorName: author?.display_name || "Author",
    coverUrl: coverPublicUrl(
      projectCoverPath(project),
      project.updated_at ? Date.parse(project.updated_at) : undefined
    ),
    applyUrl: `/beta/book/${project.id}`,
    firstChapter: first
      ? {
          id: first.id,
          title: first.title || "Chapter 1",
          contentHtml: first.content_html || "<p></p>",
        }
      : null,
  });
}

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { userHasPro } from "@/lib/credits";
import { normalizeDetails, normalizeFormat } from "@/lib/book/format";
import { getStyle } from "@/lib/book/styles";
import { CoverBuilder } from "@/components/CoverBuilder";

export const metadata = { title: "Cover builder — Novelist Writer", robots: { index: false } };

export default async function CoverBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/project/${id}/cover-builder`);

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!project) notFound();
  if (project.locked_at) redirect(`/project/${id}`);

  const [{ data: profile }, pro] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    userHasPro(user.id),
  ]);
  const details = normalizeDetails(project.book_details);
  const format = normalizeFormat(project.format_settings);
  const style = getStyle(format.style);

  return (
    <CoverBuilder
      projectId={id}
      userId={user.id}
      book={{
        title: project.title || "Untitled",
        subtitle: project.subtitle || "",
        author: details.penName || profile?.display_name || "Author",
        series: details.seriesName ? `${details.seriesName}${details.seriesNumber ? ` · Book ${details.seriesNumber}` : ""}` : "",
        blurb: project.blurb || "",
        heading: style.heading,
        body: style.body,
      }}
      formatSettings={project.format_settings}
      savedDesign={project.cover_design ?? null}
      migrationNeeded={!("cover_design" in project)}
      pro={pro}
    />
  );
}

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasPro } from "@/lib/credits";
import { loadBookExtras } from "@/lib/book/load";
import { PrintStudio } from "@/components/PrintStudio";

export const metadata = { title: "Print layout — Novelist Writer", robots: { index: false } };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/project/${id}/print`);

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!project) notFound();
  if (project.locked_at) redirect(`/project/${id}`);

  const admin = createServiceClient();
  const [{ data: chapters }, { data: matter }, { data: profile }, extras, pro] = await Promise.all([
    supabase.from("chapters").select("id, title, content_html, content_text, sort_order, word_count").eq("project_id", id).order("sort_order"),
    supabase.from("matter_blocks").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    loadBookExtras(admin, project),
    userHasPro(user.id),
  ]);

  return (
    <PrintStudio
      projectId={id}
      title={project.title || "Untitled"}
      subtitle={project.subtitle || ""}
      authorName={profile?.display_name || user.email || "Author"}
      formatSettings={project.format_settings}
      bookDetails={project.book_details}
      migrationNeeded={!("format_settings" in project)}
      chapters={chapters || []}
      matter={matter || []}
      extras={extras}
      pro={pro}
    />
  );
}

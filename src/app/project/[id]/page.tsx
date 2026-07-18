import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) notFound();

  const [
    { data: chapters },
    { data: bible },
    { data: matter },
    { data: profile },
    { data: promises },
    { data: arcs },
    { data: credits },
  ] = await Promise.all([
    supabase.from("chapters").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("bible_entries").select("*").eq("project_id", id).order("created_at"),
    supabase.from("matter_blocks").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("profiles").select("challenge_level").eq("id", user.id).maybeSingle(),
    supabase.from("story_promises").select("id, description, status").eq("project_id", id),
    supabase.from("arc_tracks").select("id, arc_type, subject, notes").eq("project_id", id),
    supabase
      .from("credit_balances")
      .select("balance, monthly_allowance_remaining")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const creditTotal =
    (credits?.balance ?? 0) + (credits?.monthly_allowance_remaining ?? 0);

  return (
    <ProjectWorkspace
      project={project}
      chapters={chapters || []}
      bible={bible || []}
      matter={matter || []}
      challengeLevel={profile?.challenge_level ?? 50}
      promises={promises || []}
      arcs={arcs || []}
      initialCredits={creditTotal}
    />
  );
}

import { createServiceClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { BetaReaderClient } from "@/components/BetaReaderClient";

type InviteRow = {
  id: string;
  project_id: string;
  status: string;
  projects: { title: string } | { title: string }[] | null;
};

export default async function BetaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let invite: InviteRow | null = null;
  let chapters: { id: string; title: string; content_html: string; sort_order: number }[] = [];

  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("beta_invites")
      .select("id, project_id, status, projects(title)")
      .eq("token", token)
      .maybeSingle();
    invite = data as InviteRow | null;
    if (invite && invite.status !== "revoked") {
      const { data: ch } = await admin
        .from("chapters")
        .select("id, title, content_html, sort_order")
        .eq("project_id", invite.project_id)
        .order("sort_order");
      chapters = (ch || []) as typeof chapters;
    }
  } catch {
    notFound();
  }

  if (!invite || invite.status === "revoked") notFound();

  const projectTitle = Array.isArray(invite.projects)
    ? invite.projects[0]?.title
    : invite.projects?.title;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="font-ui text-xs uppercase tracking-wide text-muted">Beta read</p>
      <h1 className="font-display mt-2 text-3xl">{projectTitle || "Manuscript"}</h1>
      <BetaReaderClient
        token={token}
        projectId={invite.project_id}
        chapters={chapters}
      />
    </div>
  );
}

import { createServiceClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BetaReaderClient } from "@/components/BetaReaderClient";

type InviteRow = {
  id: string;
  project_id: string;
  status: string;
  projects: { title: string } | { title: string }[] | null;
};

export default async function BetaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ chapter?: string }>;
}) {
  const { token } = await params;
  const { chapter: chapterParam } = await searchParams;

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
    if (invite && (invite.status === "pending" || invite.status === "accepted")) {
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

  if (!invite || (invite.status !== "pending" && invite.status !== "accepted")) {
    if (invite?.status === "requested") {
      return (
        <div className="mx-auto max-w-lg px-6 py-16">
          <p className="font-ui text-xs uppercase tracking-wide text-muted">Beta read</p>
          <h1 className="font-display mt-2 text-3xl">Waiting for approval</h1>
          <p className="mt-3 text-sm text-muted">
            Your request is in the author’s Beta tab. You’ll get a reading link if they approve it.
          </p>
        </div>
      );
    }
    notFound();
  }

  const projectTitle = Array.isArray(invite.projects)
    ? invite.projects[0]?.title
    : invite.projects?.title;

  const initialChapterId =
    chapterParam && chapters.some((c) => c.id === chapterParam)
      ? chapterParam
      : undefined;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="font-ui text-xs uppercase tracking-wide text-muted">Beta read</p>
      <h1 className="font-display mt-2 text-3xl">{projectTitle || "Manuscript"}</h1>
      <Suspense fallback={<p className="mt-8 text-sm text-muted">Loading…</p>}>
        <BetaReaderClient
          token={token}
          projectId={invite.project_id}
          chapters={chapters}
          initialChapterId={initialChapterId}
        />
      </Suspense>
    </div>
  );
}

import { createServiceClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BetaReaderClient } from "@/components/BetaReaderClient";
import {
  missingRequiredAnswers,
  normalizeBetaApplicationForm,
  sanitizeApplicationAnswers,
} from "@/lib/beta-form";

type InviteRow = {
  id: string;
  project_id: string;
  status: string;
  application_answers: unknown;
  projects:
    | { title: string; beta_application_form: unknown }
    | { title: string; beta_application_form: unknown }[]
    | null;
};

function projectFromInvite(invite: InviteRow) {
  return Array.isArray(invite.projects) ? invite.projects[0] : invite.projects;
}

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

  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("beta_invites")
      .select("id, project_id, status, application_answers, projects(title, beta_application_form)")
      .eq("token", token)
      .maybeSingle();
    invite = data as InviteRow | null;
  } catch {
    notFound();
  }

  if (
    !invite ||
    (invite.status !== "pending" && invite.status !== "accepted" && invite.status !== "dnf")
  ) {
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

  const project = projectFromInvite(invite);
  const form = normalizeBetaApplicationForm(project?.beta_application_form);
  const answers = sanitizeApplicationAnswers(form.fields, invite.application_answers);
  const needsApplication =
    form.fields.length > 0 && missingRequiredAnswers(form.fields, answers).length > 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="font-ui text-xs uppercase tracking-wide text-muted">Beta read</p>
      <h1 className="font-display mt-2 text-3xl">{project?.title || "Manuscript"}</h1>
      <Suspense fallback={<p className="mt-8 text-sm text-muted">Loading…</p>}>
        <BetaReaderClient
          token={token}
          projectId={invite.project_id}
          form={form}
          needsApplication={needsApplication}
          initialChapterId={chapterParam}
        />
      </Suspense>
    </div>
  );
}

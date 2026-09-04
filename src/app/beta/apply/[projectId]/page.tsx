import { createServiceClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { BetaApplyForm } from "@/components/BetaApplyForm";
import { normalizeBetaFormFields } from "@/lib/beta-form";

export default async function BetaApplyPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const admin = createServiceClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, title, beta_application_form")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();

  const fields = normalizeBetaFormFields(project.beta_application_form);

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <p className="font-ui text-xs uppercase tracking-wide text-muted">Beta reader application</p>
      <h1 className="font-display mt-2 text-3xl">{project.title || "Manuscript"}</h1>
      <p className="mt-3 text-sm text-muted">
        Fill out this form to request access. The author will approve or deny your request. If
        approved, they’ll send you a private reading link.
      </p>
      <BetaApplyForm projectId={project.id} fields={fields} />
    </div>
  );
}

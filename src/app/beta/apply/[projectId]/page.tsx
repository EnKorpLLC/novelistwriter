import { createServiceClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { BetaApplyForm } from "@/components/BetaApplyForm";
import { normalizeBetaApplicationForm } from "@/lib/beta-form";

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

  const form = normalizeBetaApplicationForm(project.beta_application_form);

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <p className="font-ui text-xs uppercase tracking-wide text-muted">Beta reader application</p>
      <h1 className="font-display mt-2 text-3xl">{project.title || "Manuscript"}</h1>
      <p className="mt-3 text-sm text-muted">
        Prefer the reader dashboard?{" "}
        <a href={`/beta/book/${project.id}`} className="text-accent underline">
          Open the book page
        </a>{" "}
        after you log in.
      </p>
      {!form.intro && (
        <p className="mt-3 text-sm text-muted">
          Fill out this form to request access. If you’re already approved, use the email check at
          the top to open the manuscript.
        </p>
      )}
      <BetaApplyForm projectId={project.id} form={form} />
    </div>
  );
}

import { notFound, permanentRedirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureHandle, ensureSlug } from "@/lib/public-site";
import { bookPath } from "@/lib/handles";

export const dynamic = "force-dynamic";

/** Old book URL; each book's launch page now lives at /a/[handle]/[slug]. */
export default async function OldBookPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const admin = createServiceClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, user_id, title, slug, published")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.published) notFound();
  const [handle, slug] = await Promise.all([ensureHandle(admin, project.user_id), ensureSlug(admin, project)]);
  if (!handle || !slug) notFound();
  permanentRedirect(bookPath(handle, slug));
}

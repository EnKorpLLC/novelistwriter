export function coverPublicUrl(coverPath: string | null | undefined): string | null {
  if (!coverPath) return null;
  if (coverPath.startsWith("http")) return coverPath;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/covers/${coverPath}`;
}

export function projectCoverPath(project: {
  cover_path?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  if (project.cover_path) return project.cover_path;
  const meta = project.metadata?.cover_path;
  return typeof meta === "string" ? meta : null;
}

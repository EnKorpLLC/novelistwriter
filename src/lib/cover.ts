export function coverPublicUrl(
  coverPath: string | null | undefined,
  version?: string | number
): string | null {
  if (!coverPath) return null;
  if (coverPath.startsWith("http")) {
    const v = version != null ? `v=${version}` : "";
    if (!v) return coverPath;
    return coverPath.includes("?") ? `${coverPath}&${v}` : `${coverPath}?${v}`;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const url = `${base.replace(/\/$/, "")}/storage/v1/object/public/covers/${coverPath}`;
  return version != null ? `${url}?v=${version}` : url;
}

export function projectCoverPath(project: {
  cover_path?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  if (project.cover_path) return project.cover_path;
  const meta = project.metadata?.cover_path;
  return typeof meta === "string" ? meta : null;
}

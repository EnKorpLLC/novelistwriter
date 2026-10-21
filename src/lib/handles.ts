/** Author handles (/a/handle) and book slugs (/a/handle/slug). Safe on client and server. */

export function slugify(input: string, max = 60): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

const RESERVED_HANDLES = new Set(["admin", "api", "new", "settings", "edit", "preview", "novelistwriter"]);

/** Returns an error message, or null when the handle is usable. */
export function handleProblem(handle: string): string | null {
  if (handle.length < 3) return "Use at least 3 characters.";
  if (handle.length > 30) return "Use 30 characters or fewer.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) {
    return "Use lowercase letters, numbers, and single dashes.";
  }
  if (RESERVED_HANDLES.has(handle)) return "That handle is reserved.";
  return null;
}

export function slugProblem(slug: string): string | null {
  if (!slug) return "Enter a link name.";
  if (slug.length > 60) return "Use 60 characters or fewer.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Use lowercase letters, numbers, and single dashes.";
  }
  return null;
}

export function authorPath(handle: string) {
  return `/a/${handle}`;
}

export function bookPath(handle: string, slug: string) {
  return `/a/${handle}/${slug}`;
}

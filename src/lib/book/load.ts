import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/stripe";
import { normalizeBuyLinks } from "@/lib/arc";
import { authorPath, bookPath } from "@/lib/handles";
import { authorSitePublic } from "@/lib/credits";
import { projectCoverPath } from "@/lib/cover";
import { normalizeDetails } from "@/lib/book/format";
import type { BookExtras } from "@/lib/book/model";
import type { EpubCover } from "@/lib/book/epub";

/** Links and lists the generated pages need: "Also by", review request, newsletter, writing record. */
export async function loadBookExtras(
  admin: SupabaseClient,
  project: { id: string; user_id: string; slug?: string | null; buy_links?: unknown; record_public?: boolean | null }
): Promise<BookExtras> {
  const [sitePublic, { data: profile }, { data: others }] = await Promise.all([
    authorSitePublic(project.user_id),
    admin.from("profiles").select("handle").eq("id", project.user_id).maybeSingle(),
    admin
      .from("projects")
      .select("id, title, slug, published, launch_public, book_details, updated_at")
      .eq("user_id", project.user_id)
      .neq("id", project.id)
      .order("updated_at", { ascending: false }),
  ]);
  const handle = (profile?.handle as string | null) || null;
  const pageUrl = (slug: string | null | undefined) => (sitePublic && handle && slug ? appUrl(bookPath(handle, slug)) : null);

  const alsoBy = (others || [])
    .filter((p) => p.published || p.launch_public)
    .map((p) => {
      const d = normalizeDetails(p.book_details);
      return {
        title: p.title || "Untitled",
        series: d.seriesName ? `${d.seriesName}${d.seriesNumber ? `, book ${d.seriesNumber}` : ""}` : undefined,
        url: pageUrl(p.slug),
      };
    });

  const buy = normalizeBuyLinks(project.buy_links).filter((l) => !l.preorder);
  return {
    alsoBy,
    reviewLink: buy[0] ? { label: buy[0].label, url: buy[0].url } : null,
    newsletterUrl: sitePublic && handle ? appUrl(authorPath(handle)) : null,
    recordUrl: project.record_public && sitePublic && handle && project.slug ? appUrl(`${bookPath(handle, project.slug)}/record`) : null,
  };
}

/** The project's cover for ebook embedding. */
export async function loadCover(
  storageClient: SupabaseClient,
  project: { cover_path?: string | null; metadata?: Record<string, unknown> | null }
): Promise<EpubCover | null> {
  const coverPath = projectCoverPath(project);
  if (!coverPath) return null;
  const { data: file, error } = await storageClient.storage.from("covers").download(coverPath);
  if (error || !file) return null;
  const lower = coverPath.toLowerCase();
  const type = lower.endsWith(".png") ? "png" : lower.endsWith(".webp") ? "webp" : lower.endsWith(".gif") ? "gif" : "jpg";
  return { data: new Uint8Array(await file.arrayBuffer()), type };
}

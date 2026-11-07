import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/stripe";
import { STATIC_PAGES, publicSitemapEntries } from "@/lib/seo";

// Rebuilt at most once an hour
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: appUrl(p.path),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
  try {
    const dynamic = await publicSitemapEntries(createServiceClient());
    return [
      ...pages,
      ...dynamic.map((e) => ({
        url: e.url,
        lastModified: e.lastModified ? new Date(e.lastModified) : undefined,
        changeFrequency: e.changeFrequency,
        priority: e.priority,
      })),
    ];
  } catch {
    return pages;
  }
}

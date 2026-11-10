import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ContentKind = "guide" | "report" | "page";

export type ContentPage = {
  id: string;
  kind: ContentKind;
  slug: string;
  title: string;
  summary: string;
  body: string;
  faq: { q: string; a: string }[];
  author_name: string;
  related_path: string;
  related_label: string;
  data: ReportData | null;
  status: "draft" | "published";
  published_at: string | null;
  updated_at: string;
};

export type ReportData = {
  generatedAt: string;
  period: string;
  minGroup: number;
  sections: { title: string; note: string; rows: { label: string; value: number; display: string }[] }[];
};

export const CONTENT_MIGRATION_HINT = "Database needs an update. Run supabase/migration_search_content.sql in the Supabase SQL editor.";

/** Site pages that live at their own address rather than under /guides or /reports. */
export const SITE_PAGES = ["human-authorship-standard"] as const;

export function contentPath(kind: ContentKind, slug: string) {
  return kind === "guide" ? `/guides/${slug}` : kind === "report" ? `/reports/${slug}` : `/${slug}`;
}

export function normalizeFaq(raw: unknown): { q: string; a: string }[] {
  return (Array.isArray(raw) ? raw : [])
    .map((f) => ({ q: String((f as { q?: unknown })?.q || "").trim(), a: String((f as { a?: unknown })?.a || "").trim() }))
    .filter((f) => f.q && f.a)
    .slice(0, 20);
}

function shape(row: Record<string, unknown>): ContentPage {
  return { ...(row as unknown as ContentPage), faq: normalizeFaq(row.faq) };
}

/** Published pages of a kind, newest first. Empty before the migration. */
export async function listPublished(admin: SupabaseClient, kind: ContentKind): Promise<ContentPage[]> {
  const { data, error } = await admin.from("content_pages").select("*").eq("kind", kind).eq("status", "published").order("published_at", { ascending: false }).limit(500);
  if (error) return [];
  return (data || []).map(shape);
}

export async function loadPublished(admin: SupabaseClient, kind: ContentKind, slug: string): Promise<ContentPage | null> {
  const { data, error } = await admin.from("content_pages").select("*").eq("kind", kind).eq("slug", slug).eq("status", "published").maybeSingle();
  if (error || !data) return null;
  return shape(data);
}

/** For public pages: works (empty) even when the database isn't reachable, such as during a local build. */
export async function publishedList(kind: ContentKind): Promise<ContentPage[]> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    return await listPublished(createServiceClient(), kind);
  } catch {
    return [];
  }
}

export async function publishedPage(kind: ContentKind, slug: string): Promise<ContentPage | null> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    return await loadPublished(createServiceClient(), kind, slug);
  } catch {
    return null;
  }
}

export function longDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
}

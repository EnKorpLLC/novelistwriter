import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/handles";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { genreLabel } from "@/lib/beta-platform";
import { isArcWindowOpen, normalizeBuyLinks, normalizeTropes, type BuyLink } from "@/lib/arc";
import { normalizePublicLinks, publicLinkList, type LabeledLink } from "@/lib/public-profile";
import { normalizeTheme, type SiteThemeId } from "@/lib/site-themes";
import { userHasStudio } from "@/lib/credits";

/** Give an author a handle the first time something needs their public link. */
export async function ensureHandle(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data: p, error } = await admin
    .from("profiles")
    .select("handle, display_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (error || !p) return null;
  if (p.handle) return p.handle;
  let base = slugify(p.display_name || String(p.email || "").split("@")[0], 30);
  if (base.length < 3) base = "author";
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const { data: taken } = await admin.from("profiles").select("id").ilike("handle", candidate).maybeSingle();
    if (taken) continue;
    const { error: upErr } = await admin
      .from("profiles")
      .update({ handle: candidate })
      .eq("id", userId)
      .is("handle", null);
    if (!upErr) return candidate;
  }
  return null;
}

/** Give a book a slug the first time something needs its public link. */
export async function ensureSlug(
  admin: SupabaseClient,
  project: { id: string; user_id: string; title: string; slug?: string | null }
): Promise<string | null> {
  if (project.slug) return project.slug;
  const base = slugify(project.title) || "book";
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const { data: taken } = await admin
      .from("projects")
      .select("id")
      .eq("user_id", project.user_id)
      .ilike("slug", candidate)
      .maybeSingle();
    if (taken) continue;
    const { error } = await admin
      .from("projects")
      .update({ slug: candidate })
      .eq("id", project.id)
      .is("slug", null);
    if (!error) return candidate;
  }
  return null;
}

export type AuthorSite = {
  userId: string;
  handle: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  theme: SiteThemeId;
  featuredProjectId: string | null;
  links: LabeledLink[];
};

/** URL segments go into ilike lookups, so only plain slug characters are allowed through. */
function safeSegment(raw: string): string | null {
  const s = decodeURIComponent(raw || "").toLowerCase();
  return /^[a-z0-9-]{1,60}$/.test(s) ? s : null;
}

export async function resolveAuthor(admin: SupabaseClient, rawHandle: string): Promise<AuthorSite | null> {
  const handle = safeSegment(rawHandle);
  if (!handle) return null;
  const { data: p } = await admin
    .from("profiles")
    .select("id, handle, display_name, bio, avatar_path, banner_path, site_theme, featured_project_id, public_links, is_author")
    .ilike("handle", handle)
    .maybeSingle();
  if (!p || p.is_author === false) return null;
  return {
    userId: p.id,
    handle: p.handle,
    name: p.display_name || "Author",
    bio: String(p.bio || "").trim(),
    avatarUrl: coverPublicUrl(p.avatar_path),
    bannerUrl: coverPublicUrl(p.banner_path),
    theme: normalizeTheme(p.site_theme),
    featuredProjectId: p.featured_project_id || null,
    links: publicLinkList(normalizePublicLinks(p.public_links)),
  };
}

export type LaunchStage = "published" | "arc" | "beta" | "coming_soon";

export type LaunchBook = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  genre: string;
  tropes: string[];
  blurb: string;
  coverUrl: string | null;
  releaseDate: string | null;
  published: boolean;
  betaOpen: boolean;
  arcOpen: boolean;
  arcDeadline: string | null;
  buyLinks: BuyLink[];
  preorderLinks: BuyLink[];
  stage: LaunchStage;
};

const BOOK_FIELDS =
  "id, slug, title, tagline, genre, tropes, blurb, cover_path, metadata, updated_at, user_id, release_date, published, launch_public, beta_ready, arc_open, arc_deadline, buy_links";

type BookRow = {
  id: string;
  slug: string | null;
  title: string;
  tagline: string | null;
  genre: string | null;
  tropes: unknown;
  blurb: string | null;
  cover_path: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
  user_id: string;
  release_date: string | null;
  published: boolean;
  launch_public: boolean;
  beta_ready: boolean;
  arc_open: boolean;
  arc_deadline: string | null;
  buy_links: unknown;
};

function toLaunchBook(row: BookRow, studio: boolean): LaunchBook | null {
  const betaOpen = studio && Boolean(row.beta_ready);
  const arcOpen = studio && isArcWindowOpen(row);
  const published = Boolean(row.published);
  if (!row.slug || !(published || row.launch_public || betaOpen || arcOpen)) return null;
  const links = normalizeBuyLinks(row.buy_links);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    tagline: String(row.tagline || "").trim(),
    genre: genreLabel(row.genre),
    tropes: normalizeTropes(row.tropes),
    blurb: String(row.blurb || "").trim(),
    coverUrl: coverPublicUrl(projectCoverPath(row), row.updated_at ? Date.parse(row.updated_at) : undefined),
    releaseDate: row.release_date,
    published,
    betaOpen,
    arcOpen,
    arcDeadline: row.arc_deadline,
    buyLinks: links.filter((l) => !l.preorder),
    preorderLinks: links.filter((l) => l.preorder),
    stage: published ? "published" : arcOpen ? "arc" : betaOpen ? "beta" : "coming_soon",
  };
}

/** Every book of this author that has a public launch page. */
export async function listLaunchBooks(admin: SupabaseClient, authorUserId: string): Promise<LaunchBook[]> {
  const [{ data }, studio] = await Promise.all([
    admin.from("projects").select(BOOK_FIELDS).eq("user_id", authorUserId).order("updated_at", { ascending: false }),
    userHasStudio(authorUserId),
  ]);
  return ((data || []) as BookRow[])
    .map((r) => toLaunchBook(r, studio))
    .filter((b): b is LaunchBook => Boolean(b));
}

export async function getLaunchBook(
  admin: SupabaseClient,
  authorUserId: string,
  rawSlug: string
): Promise<LaunchBook | null> {
  const slug = safeSegment(rawSlug);
  if (!slug) return null;
  const [{ data }, studio] = await Promise.all([
    admin.from("projects").select(BOOK_FIELDS).eq("user_id", authorUserId).ilike("slug", slug).maybeSingle(),
    userHasStudio(authorUserId),
  ]);
  return data ? toLaunchBook(data as BookRow, studio) : null;
}

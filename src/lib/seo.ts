import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/stripe";
import { authorPath, bookPath } from "@/lib/handles";
import { rowHasStudio, rowSitePublic } from "@/lib/credits";
import { isArcWindowOpen } from "@/lib/arc";
import { PLANS, PRICING_FAQ } from "@/lib/plans";

/** Public marketing pages, always in the sitemap. */
export const STATIC_PAGES = [
  { path: "/", priority: 1, changeFrequency: "weekly" as const },
  { path: "/authors", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/readers", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/books", priority: 0.8, changeFrequency: "daily" as const },
  { path: "/challenges", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/tools", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/tools/spine-calculator", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/tools/novel-word-count", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/tools/trim-sizes", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/tools/writing-pace", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/compare", priority: 0.7, changeFrequency: "monthly" as const },
  ...["scrivener", "vellum", "atticus", "betabooks", "netgalley"].map((s) => ({ path: `/compare/${s}`, priority: 0.6, changeFrequency: "monthly" as const })),
  ...["scrivener", "word", "vellum", "atticus"].map((s) => ({ path: `/switch/${s}`, priority: 0.6, changeFrequency: "monthly" as const })),
  { path: "/your-data", priority: 0.4, changeFrequency: "yearly" as const },
  { path: "/contact", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
];

type SitemapEntry = { url: string; lastModified?: string; priority?: number; changeFrequency?: "daily" | "weekly" | "monthly" | "yearly" };

const PAGE = 1000;

async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 20000) {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error || !data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/** Every public author site, launch page, writing record, and reader profile, following the plan rules. */
export async function publicSitemapEntries(admin: SupabaseClient): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];

  const [authors, balances, books] = await Promise.all([
    all<{ id: string; handle: string | null; updated_at: string | null; is_author: boolean | null }>((f, t) =>
      admin.from("profiles").select("id, handle, updated_at, is_author").not("handle", "is", null).range(f, t)
    ),
    all<Record<string, unknown> & { user_id: string }>((f, t) => admin.from("credit_balances").select("*").range(f, t)),
    all<{
      id: string;
      user_id: string;
      slug: string | null;
      updated_at: string | null;
      published: boolean | null;
      launch_public: boolean | null;
      beta_ready: boolean | null;
      arc_open: boolean | null;
      arc_deadline: string | null;
      record_public: boolean | null;
    }>((f, t) =>
      admin
        .from("projects")
        .select("id, user_id, slug, updated_at, published, launch_public, beta_ready, arc_open, arc_deadline, record_public")
        .not("slug", "is", null)
        .range(f, t)
    ),
  ]);

  const balanceById = new Map(balances.map((b) => [b.user_id, b]));
  const sitePublic = (id: string) => rowSitePublic((balanceById.get(id) as Parameters<typeof rowSitePublic>[0]) || null);
  const studio = (id: string) => rowHasStudio((balanceById.get(id) as Parameters<typeof rowHasStudio>[0]) || null);
  const handleById = new Map<string, string>();

  for (const a of authors) {
    if (!a.handle || a.is_author === false || !sitePublic(a.id)) continue;
    handleById.set(a.id, a.handle);
    entries.push({ url: appUrl(authorPath(a.handle)), lastModified: a.updated_at || undefined, priority: 0.7, changeFrequency: "weekly" });
  }

  for (const b of books) {
    const handle = handleById.get(b.user_id);
    if (!handle || !b.slug) continue;
    const visible =
      b.published || b.launch_public || (studio(b.user_id) && (b.beta_ready || isArcWindowOpen(b)));
    if (!visible) continue;
    entries.push({ url: appUrl(bookPath(handle, b.slug)), lastModified: b.updated_at || undefined, priority: 0.8, changeFrequency: "weekly" });
    if (b.record_public) {
      entries.push({ url: appUrl(`${bookPath(handle, b.slug)}/record`), lastModified: b.updated_at || undefined, priority: 0.5, changeFrequency: "weekly" });
    }
  }

  // Public reader profiles (only after migration_reader_profile.sql)
  const { data: readers } = await admin
    .from("profiles")
    .select("handle, updated_at")
    .eq("reader_profile_public", true)
    .not("handle", "is", null)
    .limit(10000);
  for (const r of readers || []) {
    entries.push({ url: appUrl(`/r/${r.handle}`), lastModified: r.updated_at || undefined, priority: 0.3, changeFrequency: "monthly" });
  }

  // Public challenges (only after migration_challenges.sql)
  const { data: challenges } = await admin.from("challenges").select("slug, updated_at").eq("is_public", true).limit(1000);
  for (const c of challenges || []) {
    entries.push({ url: appUrl(`/challenges/${c.slug}`), lastModified: c.updated_at || undefined, priority: 0.6, changeFrequency: "daily" });
  }

  return entries;
}

/* ---------- Structured data (JSON-LD) ---------- */

type Json = Record<string, unknown>;

const priceOf = (price: string) => Number(price.replace(/[^0-9.]/g, "")) || 0;

export function organizationJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Novelist Writer",
    url: appUrl("/"),
    description:
      "The writing studio that proves a human wrote the book, then takes it through beta readers and ARCs to launch.",
  };
}

export function websiteJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Novelist Writer",
    url: appUrl("/"),
  };
}

export function softwareJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Novelist Writer",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Writing software",
    operatingSystem: "Web browser",
    url: appUrl("/"),
    description:
      "Write your novel, keep a verifiable record of how you wrote it, run beta and ARC readers, format a store-ready ebook and print-ready paperback with book styles, and launch with an author site and launch pages.",
    offers: PLANS.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: priceOf(p.price),
      priceCurrency: "USD",
      description: p.lead,
      url: appUrl("/pricing"),
    })),
  };
}

/** Title, description, canonical, and share image for Novelist Writer's own content pages. */
export function contentMetadata(o: { title: string; description: string; path: string; kicker: string }) {
  const image = `/og?${new URLSearchParams({ t: o.title, k: o.kicker, s: o.description.slice(0, 110) }).toString()}`;
  return {
    title: `${o.title} — Novelist Writer`,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: { title: o.title, description: o.description, images: [image] },
    twitter: { card: "summary_large_image" as const, title: o.title, description: o.description, images: [image] },
  };
}

export function faqJsonLd(items: { q: string; a: string }[] = PRICING_FAQ): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: appUrl(it.path),
    })),
  };
}

export function authorJsonLd(author: { name: string; bio: string; path: string; avatarUrl: string | null; links: { url: string }[] }): Json {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: appUrl(author.path),
    mainEntity: {
      "@type": "Person",
      name: author.name,
      description: author.bio || undefined,
      url: appUrl(author.path),
      image: author.avatarUrl || undefined,
      sameAs: author.links.map((l) => l.url).filter((u) => /^https?:\/\//.test(u)),
    },
  };
}

export function bookJsonLd(book: {
  title: string;
  authorName: string;
  authorPath: string;
  path: string;
  description: string;
  coverUrl: string | null;
  genre: string;
  releaseDate: string | null;
  isbn?: string | null;
  buyLinks: { label: string; url: string }[];
  published: boolean;
}): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    url: appUrl(book.path),
    author: { "@type": "Person", name: book.authorName, url: appUrl(book.authorPath) },
    description: book.description || undefined,
    image: book.coverUrl || undefined,
    genre: book.genre || undefined,
    datePublished: book.releaseDate || undefined,
    isbn: book.isbn || undefined,
    bookFormat: "https://schema.org/EBook",
    offers: book.buyLinks
      .filter((l) => /^https?:\/\//.test(l.url))
      .map((l) => ({
        "@type": "Offer",
        url: l.url,
        seller: { "@type": "Organization", name: l.label },
        availability: book.published ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      })),
  };
}

/* ---------- IndexNow (Bing and others pick up new public pages right away) ---------- */

/** Tell search engines a public page changed. Needs INDEXNOW_KEY; silently skipped without it. */
export async function pingIndexNow(paths: string[]) {
  const key = process.env.INDEXNOW_KEY;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!key || !base || !paths.length) return;
  try {
    const host = new URL(base).host;
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: appUrl("/indexnow.txt"),
        urlList: [...new Set(paths)].map((p) => appUrl(p)),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Search engines also find pages through the sitemap; a failed ping never blocks a save
  }
}

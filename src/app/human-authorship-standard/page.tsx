import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { ContentArticle } from "@/components/ContentArticle";
import { contentMetadata } from "@/lib/seo";
import { publishedPage } from "@/lib/content";
import { STARTER_DRAFTS } from "@/lib/content-drafts";

export const revalidate = 600;

const SLUG = "human-authorship-standard";
const fallback = STARTER_DRAFTS.find((d) => d.slug === SLUG)!;

export const metadata = contentMetadata({
  title: "The human authorship standard",
  description: fallback.summary.slice(0, 200),
  path: `/${SLUG}`,
  kicker: "How we verify",
});

/** Linked from every proof badge. Shows the edited version once it's published in admin, and the built-in text until then. */
export default async function HumanAuthorshipStandardPage() {
  const edited = await publishedPage("page", SLUG);
  const page = edited || { ...fallback, author_name: "", data: null, published_at: null, updated_at: "2026-11-09T12:00:00Z" };
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <ContentArticle page={page} />
      <PublicFooter />
    </div>
  );
}

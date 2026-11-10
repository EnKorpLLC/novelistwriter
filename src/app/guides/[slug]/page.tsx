import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { ContentArticle } from "@/components/ContentArticle";
import { contentMetadata } from "@/lib/seo";
import { publishedPage } from "@/lib/content";

export const revalidate = 600;

type Params = { slug: string };

async function load(slug: string) {
  return publishedPage("guide", slug);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const guide = await load((await params).slug);
  if (!guide) return { title: "Guide not found" };
  return contentMetadata({ title: guide.title, description: guide.summary.slice(0, 200), path: `/guides/${guide.slug}`, kicker: "Guide" });
}

export default async function GuidePage({ params }: { params: Promise<Params> }) {
  const guide = await load((await params).slug);
  if (!guide) notFound();
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <ContentArticle page={guide} back={{ href: "/guides", label: "Guides" }} />
      <PublicFooter />
    </div>
  );
}

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
  return publishedPage("report", slug);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const report = await load((await params).slug);
  if (!report) return { title: "Report not found" };
  return contentMetadata({ title: report.title, description: report.summary.slice(0, 200), path: `/reports/${report.slug}`, kicker: "Report" });
}

export default async function ReportPage({ params }: { params: Promise<Params> }) {
  const report = await load((await params).slug);
  if (!report) notFound();
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <ContentArticle page={report} back={{ href: "/reports", label: "Reports" }} />
      <PublicFooter />
    </div>
  );
}

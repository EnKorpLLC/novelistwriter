import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";
import { publishedList, longDate } from "@/lib/content";

export const revalidate = 600;

export const metadata = contentMetadata({
  title: "Self-publishing guides",
  description: "Straight answers for self-published authors: KDP formatting, trim sizes, spine width and cover size, beta readers, ARC timelines, and launch checklists.",
  path: "/guides",
  kicker: "Guides",
});

export default async function GuidesPage() {
  const guides = await publishedList("guide");
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Guides</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Self-publishing, answered</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">The direct answer first, then the details. Each guide links to the free tool that does the work.</p>
        {guides.length === 0 ? (
          <p className="font-ui mt-10 text-sm text-muted">Guides are on the way. Meanwhile, try the <Link href="/tools" className="text-accent underline">free tools</Link>.</p>
        ) : (
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {guides.map((g) => (
              <li key={g.id} className="py-5">
                <Link href={`/guides/${g.slug}`} className="font-display text-2xl hover:text-accent">
                  {g.title}
                </Link>
                <p className="mt-1 text-muted">{g.summary}</p>
                <p className="font-ui mt-1 text-xs text-muted">Updated {longDate(g.updated_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

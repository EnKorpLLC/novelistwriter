import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";
import { publishedList, longDate } from "@/lib/content";

export const revalidate = 600;

export const metadata = contentMetadata({
  title: "Reports: how books really get written and read",
  description: "Quarterly reports from anonymous Novelist Writer totals: words per writing day, where beta readers finish or stop, and how many advance readers post reviews.",
  path: "/reports",
  kicker: "Reports",
});

export default async function ReportsPage() {
  const reports = await publishedList("report");
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Reports</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">How books really get written and read</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Built only from anonymous totals across Novelist Writer. Every number stands for a group large enough that no author or reader can be identified.
        </p>
        {reports.length === 0 ? (
          <p className="font-ui mt-10 text-sm text-muted">The first report is on the way.</p>
        ) : (
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {reports.map((r) => (
              <li key={r.id} className="py-5">
                <Link href={`/reports/${r.slug}`} className="font-display text-2xl hover:text-accent">
                  {r.title}
                </Link>
                <p className="mt-1 text-muted">{r.summary}</p>
                <p className="font-ui mt-1 text-xs text-muted">Published {longDate(r.published_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

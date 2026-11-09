import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { WriteHereCta } from "@/components/WriteHereCta";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "Paperback trim size guide for novels",
  description: "Which paperback trim size to choose for your novel (5 x 8, 5.5 x 8.5, 6 x 9 and more), what each suits, and how it changes your page count.",
  path: "/tools/trim-sizes",
  kicker: "Free author tool",
});

const TRIMS: [string, string, number][] = [
  ['5" x 8"', "Compact fiction, romance, cozy mystery. Feels like a classic paperback.", 230],
  ['5.06" x 7.81"', "A common trade size in the UK and for genre fiction.", 225],
  ['5.25" x 8"', "Fiction and memoir; a little roomier than 5 x 8.", 245],
  ['5.5" x 8.5"', "Fiction and nonfiction; a popular middle ground.", 265],
  ['6" x 9"', "The most common trade paperback, for most fiction and nonfiction. Lowest page count, so lowest print cost.", 300],
];

export default function TrimSizesPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-6 py-12 md:px-10">
        <Link href="/tools" className="font-ui text-sm text-accent hover:underline">
          ← Free tools
        </Link>
        <h1 className="font-display mt-4 text-4xl">Paperback trim size guide</h1>
        <p className="mt-3 text-muted">
          For most novels, choose 6 x 9 or 5.5 x 8.5. Smaller sizes feel more like a mass-market paperback but add pages, which
          raises the print cost. All of these are standard at Amazon KDP and IngramSpark.
        </p>
        <table className="font-ui mt-8 w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2">Trim</th>
              <th>Best for</th>
              <th>Pages per 80,000 words</th>
            </tr>
          </thead>
          <tbody>
            {TRIMS.map(([t, d, wpp]) => (
              <tr key={t} className="border-b border-line/60 align-top">
                <td className="py-2 pr-3 text-ink">{t}</td>
                <td className="pr-3 text-muted">{d}</td>
                <td>about {Math.round(80000 / wpp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="font-ui mt-3 text-xs text-muted">Estimates at 11 pt with standard margins. Your real count depends on chapter breaks and text size.</p>
        <section className="mt-10 space-y-3">
          <h2 className="font-display text-2xl">What else changes with trim size</h2>
          <p className="text-muted">
            <strong className="text-ink">Margins:</strong> KDP&apos;s minimum inside margin grows with your page count, from 0.375&quot; under
            150 pages to 0.875&quot; over 700.
          </p>
          <p className="text-muted">
            <strong className="text-ink">Cover:</strong> your cover size depends on trim and page count. Get yours from the{" "}
            <Link href="/tools/spine-calculator" className="text-accent underline">
              spine width calculator
            </Link>
            .
          </p>
        </section>
        <WriteHereCta line="Pick a trim and Novelist Writer lays out your whole book as printed pages, with margins that follow KDP's rules for your page count." />
      </main>
      <PublicFooter />
    </div>
  );
}

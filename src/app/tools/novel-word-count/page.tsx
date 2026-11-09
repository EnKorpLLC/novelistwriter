import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { WriteHereCta } from "@/components/WriteHereCta";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "How long is a novel? Word counts by genre",
  description: "Typical novel word counts for romance, fantasy, sci-fi, thrillers, mysteries, YA, middle grade, and more, with paperback page estimates.",
  path: "/tools/novel-word-count",
  kicker: "Free author tool",
});

/** Common ranges from agent and publisher guidelines; self-published books vary more */
const GENRES: [string, number, number, string?][] = [
  ["Literary fiction", 70000, 110000],
  ["Contemporary and general fiction", 80000, 100000],
  ["Romance (single title)", 70000, 100000],
  ["Category romance", 50000, 75000, "Set by each publisher line"],
  ["Cozy mystery", 65000, 80000],
  ["Mystery and crime", 70000, 90000],
  ["Thriller and suspense", 80000, 100000],
  ["Horror", 70000, 90000],
  ["Historical fiction", 80000, 110000],
  ["Fantasy", 90000, 120000, "Epic fantasy often runs longer"],
  ["Science fiction", 90000, 120000],
  ["Young adult", 60000, 90000, "YA fantasy and sci-fi can reach 100,000"],
  ["Middle grade", 30000, 55000],
  ["Novella", 20000, 40000],
];

/** About 275 words per 6 x 9 page at 11 pt */
const WORDS_PER_PAGE = 275;

export default function WordCountPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-6 py-12 md:px-10">
        <Link href="/tools" className="font-ui text-sm text-accent hover:underline">
          ← Free tools
        </Link>
        <h1 className="font-display mt-4 text-4xl">How long is a novel in my genre?</h1>
        <p className="mt-3 text-muted">
          Most novels run 70,000 to 100,000 words. Here are the usual ranges by genre, from agent and publisher guidelines, with
          rough paperback page counts. Self-published books have more room, but readers still expect a familiar length.
        </p>
        <table className="font-ui mt-8 w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2">Genre</th>
              <th>Words</th>
              <th>Paperback pages (6 x 9)</th>
            </tr>
          </thead>
          <tbody>
            {GENRES.map(([g, lo, hi, note]) => (
              <tr key={g} className="border-b border-line/60">
                <td className="py-2 pr-3 text-ink">
                  {g}
                  {note && <span className="block text-xs text-muted">{note}</span>}
                </td>
                <td>
                  {lo.toLocaleString()}–{hi.toLocaleString()}
                </td>
                <td>
                  {Math.round(lo / WORDS_PER_PAGE)}–{Math.round(hi / WORDS_PER_PAGE)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="font-ui mt-3 text-xs text-muted">
          Page counts assume about {WORDS_PER_PAGE} words per 6 x 9 page at 11 pt. Smaller trims and larger type add pages; see the{" "}
          <Link href="/tools/trim-sizes" className="text-accent underline">
            trim size guide
          </Link>
          .
        </p>
        <WriteHereCta line="Novelist Writer tracks your word count every day, verifies every word you type, and turns the finished draft into an ebook and paperback." />
      </main>
      <PublicFooter />
    </div>
  );
}

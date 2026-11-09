import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { WriteHereCta } from "@/components/WriteHereCta";
import { SpineCalculatorTool } from "@/components/SpineCalculatorTool";
import { JsonLd } from "@/components/JsonLd";
import { contentMetadata, faqJsonLd } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "KDP spine width and cover size calculator",
  description: "Free calculator for your paperback's spine width and full cover size with bleed, for KDP and IngramSpark, from page count, trim size, and paper.",
  path: "/tools/spine-calculator",
  kicker: "Free author tool",
});

const FAQ = [
  {
    q: "How is spine width calculated?",
    a: "Page count times the thickness of one page. KDP lists 0.002252 inches per page for white paper and 0.0025 inches for cream, so a 300-page book on cream paper has a 0.75-inch spine.",
  },
  {
    q: "What size should my full paperback cover be?",
    a: "Back cover width plus spine plus front cover width, plus 0.125 inches of bleed on every edge. A 6 x 9 book with 300 cream pages needs a 13 x 9.25 inch cover.",
  },
  {
    q: "When can I put text on the spine?",
    a: "KDP only allows spine text on books with more than 79 pages. Thinner spines are too narrow to print text reliably.",
  },
];

export default function SpineCalculatorPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <JsonLd data={faqJsonLd(FAQ)} />
      <main className="mx-auto max-w-5xl px-6 py-12 md:px-10">
        <Link href="/tools" className="font-ui text-sm text-accent hover:underline">
          ← Free tools
        </Link>
        <h1 className="font-display mt-4 text-4xl">KDP spine width and cover size calculator</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Enter your page count to get the exact spine width and full wrap size, with bleed, safe area, and the barcode spot
          marked. Not sure of your page count yet? Our print layout counts it for you.
        </p>
        <div className="mt-8">
          <SpineCalculatorTool />
        </div>
        <section className="mt-12 space-y-5">
          {FAQ.map((f) => (
            <div key={f.q}>
              <h2 className="font-display text-xl">{f.q}</h2>
              <p className="mt-1 text-muted">{f.a}</p>
            </div>
          ))}
        </section>
        <WriteHereCta line="Novelist Writer lays out your paperback, saves the exact page count, and builds a cover on the right template for it." />
      </main>
      <PublicFooter />
    </div>
  );
}

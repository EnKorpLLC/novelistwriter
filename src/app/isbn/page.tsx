import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "ISBNs for indie authors",
  description:
    "When you need an ISBN and when you don't, why free ISBNs from Amazon and other platforms only work there, what your own costs, and what that means for selling on Novelist Writer. Dated, with sources.",
  path: "/isbn",
  kicker: "Guide",
});

const UPDATED = "November 11, 2026";

const SECTIONS: { t: string; d: string[] }[] = [
  {
    t: "When you need one",
    d: [
      "Every printed edition sold through stores or libraries needs its own ISBN: the paperback and the hardcover each get one, and so does each trim size.",
      "Ebooks usually don't: Kindle, Kobo, and Apple Books all publish ebooks without one.",
      "Selling direct on Novelist Writer needs none at all: ebooks, audiobooks, paperbacks printed for you, and signed copies from your shop all sell without an ISBN.",
    ],
  },
  {
    t: "Free ISBNs only work where they came from",
    d: [
      "KDP's free ISBN can only be used on KDP, and lists the publisher as “Independently published.” Draft2Digital's, IngramSpark's, and Lulu's free ISBNs come with the same kind of rule: only for books distributed through them, with them as the publisher of record.",
      "So a free ISBN can't go on an edition you sell somewhere else. For the paperback you sell here, leave KDP's ISBN and barcode off the cover (you don't need them), or use one you own.",
    ],
  },
  {
    t: "Owning your own",
    d: [
      "An ISBN you buy is registered to you or your imprint and works anywhere: KDP, IngramSpark, other stores, and here. Your imprint name shows as the publisher.",
      "In the US, Bowker is the only ISBN agency: $125 for one, $295 for ten, $575 for 100. Ten is the usual choice, since each format of each book needs its own.",
      "Some countries give them free to residents, including Canada and New Zealand.",
      "Others resell ISBNs or include them in a package; check who they're registered to before you rely on one.",
    ],
  },
  {
    t: "Adding it here",
    d: [
      "Add your ISBNs in a book's Format tab (book details). They go on the copyright page, and the print ISBN on the paperback's back cover in the cover builder.",
      "One edition, one ISBN: if the paperback printed here differs from your KDP paperback (another size, or another cover), it's its own edition.",
    ],
  },
];

const SOURCES = [
  { label: "KDP Help: ISBNs and imprints", href: "https://kdp.amazon.com/en_US/help/topic/G201834170" },
  { label: "Draft2Digital knowledge base: ISBNs", href: "https://draft2digital.com/knowledge-base/" },
  { label: "Lulu: ISBN basics", href: "https://help.lulu.com/en/support/solutions/articles/64000255457-isbn-the-basics" },
  { label: "Bowker (MyIdentifiers)", href: "https://www.myidentifiers.com/" },
];

export default function IsbnPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Guide · updated {UPDATED}</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">ISBNs for indie authors</h1>
        <p className="mt-4 text-lg text-muted">
          You need fewer ISBNs than you might think, free ones come with strings, and anything you sell direct here needs none.
        </p>
        <ul className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <li key={s.t} className="border-t border-line pt-4">
              <h2 className="font-display text-2xl">{s.t}</h2>
              {s.d.map((p) => (
                <p key={p.slice(0, 40)} className="mt-3 text-muted">
                  {p}
                </p>
              ))}
            </li>
          ))}
        </ul>
        <section className="font-ui mt-12 border-t border-line pt-4 text-sm">
          <h2 className="font-display text-xl">Sources</h2>
          <ul className="mt-2 space-y-1">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            Prices and rules change; check the agency or platform before you buy. Questions?{" "}
            <Link href="/contact" className="underline">
              Contact us
            </Link>
            .
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

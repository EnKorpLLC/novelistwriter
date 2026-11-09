import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { WriteHereCta } from "@/components/WriteHereCta";
import { ReaderPlacesDirectory } from "@/components/ReaderPlacesDirectory";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "Where readers are: book promotion sites, costs, and self-promo rules",
  description:
    "Deal newsletters, ads, reader communities, ARC services, and newsletter swaps for self-published authors, with what each costs and what each allows. Free, no sign-up.",
  path: "/tools/where-readers-are",
  kicker: "Free author guide",
});

export default function WhereReadersArePage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-12 md:px-10">
        <Link href="/tools" className="font-ui text-sm text-accent hover:underline">
          ← Free tools
        </Link>
        <h1 className="font-display mt-4 text-4xl">Where readers are</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Places to find readers for your book, what they cost, and what each one allows. Pick what you&apos;re trying to do
          and your budget. Most authors do best with two or three places done well, not all of them.
        </p>
        <div className="mt-8">
          <ReaderPlacesDirectory />
        </div>
        <WriteHereCta line="Novelist Writer turns your own book into posts (quote cards, ARC review cards, verified writing progress) and plans your marketing year around your releases. Never written by AI." />
      </main>
      <PublicFooter />
    </div>
  );
}

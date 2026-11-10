import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { ReaderDigestCta } from "@/components/ReaderDigestCta";
import { contentMetadata } from "@/lib/seo";
import { liveGenres, type GenreItem } from "@/lib/genre-pages";

export const revalidate = 3600;

type Params = { genre: string };

async function load(key: string) {
  return (await liveGenres()).find((g) => g.key === key) || null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const g = await load((await params).genre);
  if (!g) return { title: "Genre not found" };
  return contentMetadata({
    title: `${g.label} books by indie authors`,
    description: `${g.label}: new releases, books launching this week, free advance copies, and beta reads, every one written by its author.`,
    path: `/genres/${g.key}`,
    kicker: "Genre",
  });
}

function Shelf({ title, items }: { title: string; items: GenreItem[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl">{title}</h2>
      <ul className="mt-4 grid gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {items.slice(0, 12).map((b) => (
          <li key={b.id}>
            <Link href={b.href} className="block">
              {b.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.coverUrl} alt={`${b.title} cover`} className="aspect-[2/3] w-full object-cover shadow" />
              ) : (
                <div className="flex aspect-[2/3] w-full items-center justify-center bg-paper-deep p-3 text-center font-display">{b.title}</div>
              )}
            </Link>
            <Link href={b.href} className="font-display mt-2 block hover:text-accent">
              {b.title}
            </Link>
            <p className="font-ui text-xs text-muted">by {b.authorName}</p>
            {b.note && <p className="font-ui text-xs text-accent">{b.note}</p>}
            {b.badges.map((x) => (
              <p key={x} className="font-ui mt-1 inline-block border border-accent/40 px-1.5 text-[10px] text-accent">
                {x}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function GenrePage({ params }: { params: Promise<Params> }) {
  const g = await load((await params).genre);
  if (!g) notFound();
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-12 md:px-10">
        <Link href="/genres" className="font-ui text-sm text-accent hover:underline">
          ← All genres
        </Link>
        <h1 className="font-display mt-4 text-5xl">{g.label}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">Indie {g.label.toLowerCase()} written by its authors: what&apos;s new, what&apos;s launching, and what you can read early.</p>
        {g.medianWords && (
          <p className="font-ui mt-4 text-sm text-muted">
            Typical length here: about <strong className="text-ink">{g.medianWords.toLocaleString()} words</strong>, from {g.wordBooks} published books.{" "}
            <Link href="/tools/novel-word-count" className="text-accent underline">
              Word counts by genre
            </Link>
          </p>
        )}
        <Shelf title="Launching this week" items={g.launching} />
        <Shelf title="Free advance copies" items={g.arcs} />
        <Shelf title="Beta readers wanted" items={g.betas} />
        <Shelf title="Published books" items={g.books} />
        <ReaderDigestCta />
      </main>
      <PublicFooter />
    </div>
  );
}

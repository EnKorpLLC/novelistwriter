import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";
import { liveGenres } from "@/lib/genre-pages";

export const revalidate = 3600;

export const metadata = contentMetadata({
  title: "Books by genre: new releases, beta reads, and advance copies",
  description: "Indie books by genre, written by their authors: new releases, books launching this week, free advance copies, and beta reads you can join.",
  path: "/genres",
  kicker: "Genres",
});

export default async function GenresPage() {
  const genres = await liveGenres();
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Genres</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Books by genre</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">New releases, launches, free advance copies, and beta reads, written by their authors.</p>
        {genres.length === 0 ? (
          <p className="font-ui mt-10 text-sm text-muted">
            Genre pages open as each genre fills up. For now, browse <Link href="/books" className="text-accent underline">all published books</Link>.
          </p>
        ) : (
          <ul className="font-ui mt-10 grid gap-4 sm:grid-cols-2">
            {genres.map((g) => (
              <li key={g.key} className="border border-line p-4">
                <Link href={`/genres/${g.key}`} className="font-display text-xl hover:text-accent">
                  {g.label}
                </Link>
                <p className="mt-1 text-sm text-muted">
                  {[g.books.length && `${g.books.length} books`, g.launching.length && `${g.launching.length} launching`, g.arcs.length && `${g.arcs.length} advance copies`, g.betas.length && `${g.betas.length} beta reads`].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

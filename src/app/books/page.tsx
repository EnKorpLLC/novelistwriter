import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/admin";
import { listPublishedBooks } from "@/lib/public-books";
import { PublicHeader } from "@/components/PublicHeader";

export const metadata = { title: "Published books — Novelist Writer" };
export const dynamic = "force-dynamic";

export default async function PublishedBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const { genre } = await searchParams;
  const books = await listPublishedBooks(createServiceClient());
  const genres = [...new Set(books.map((b) => b.genre))].sort((a, b) => a.localeCompare(b));
  const shown = genre ? books.filter((b) => b.genre === genre) : books;

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-3xl">Published books</h1>
        <p className="font-ui mt-1 text-sm text-muted">
          Finished novels from Novelist Writer authors.
        </p>

        {genres.length > 1 && (
          <div className="font-ui mt-6 flex flex-wrap gap-2 text-xs">
            <Link
              href="/books"
              className={`border px-2.5 py-1 ${!genre ? "border-accent text-ink" : "border-line text-muted hover:text-ink"}`}
            >
              All
            </Link>
            {genres.map((g) => (
              <Link
                key={g}
                href={`/books?genre=${encodeURIComponent(g)}`}
                className={`border px-2.5 py-1 ${genre === g ? "border-accent text-ink" : "border-line text-muted hover:text-ink"}`}
              >
                {g}
              </Link>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <p className="font-ui mt-10 text-sm text-muted">No published books yet.</p>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
            {shown.map((b) => (
              <li key={b.id}>
                <Link href={`/books/${b.id}`} className="group block">
                  <div className="aspect-[2/3] overflow-hidden border border-line bg-paper-deep">
                    {b.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.coverUrl}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:opacity-90"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-3 text-center font-display text-lg text-muted">
                        {b.title}
                      </div>
                    )}
                  </div>
                  <p className="font-display mt-2 text-lg leading-tight group-hover:text-accent">
                    {b.title}
                  </p>
                  <p className="font-ui text-xs text-muted">
                    {b.authorName} · {b.genre}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

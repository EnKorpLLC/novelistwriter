import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/admin";
import { listPublishedBooks } from "@/lib/public-books";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { ReaderDigestCta } from "@/components/ReaderDigestCta";
import { CompactTrust } from "@/components/TrustBadges";
import { readerTrustForBooks } from "@/lib/trust-badges";
import { LaunchingThisWeek } from "@/components/LaunchingThisWeek";
import { launchingThisWeek } from "@/lib/spotlight";
import { createClient } from "@/lib/supabase/server";
import { TbrButton } from "@/components/LibraryButton";
import { applyContentFilters, contentFiltersFor } from "@/lib/reader-recs";
import { audiobookBadges, type AudiobookBadge } from "@/lib/audiobook-sales";
import { ratingsFor } from "@/lib/book-reviews";

export const metadata = {
  title: "Published books — Novelist Writer",
  description: "Novels by Novelist Writer authors, with a record of how each one was written.",
  alternates: { canonical: "/books" },
};
export const dynamic = "force-dynamic";

export default async function PublishedBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string; format?: string }>;
}) {
  const { genre, format } = await searchParams;
  const admin = createServiceClient();
  const [books, launching] = await Promise.all([listPublishedBooks(admin), launchingThisWeek(admin)]);
  const genres = [...new Set(books.map((b) => b.genre))].sort((a, b) => a.localeCompare(b));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const filters = await contentFiltersFor(admin, user?.id).catch(() => []);
  // Audiobooks on sale here, with their badges (before migration_audiobook_sales.sql, none)
  const { data: abRows } = await admin.from("projects").select("id, audiobook_sale").in("id", books.map((b) => b.id));
  const audio = await audiobookBadges(admin, abRows || []).catch(() => new Map<string, AudiobookBadge>());
  const audioOnly = format === "audiobook";
  const picked = books.filter((b) => (!genre || b.genre === genre) && (!audioOnly || audio.has(b.id)));
  const { shown, hidden } = await applyContentFilters(admin, filters, picked);
  // Badges and writing records the authors chose to show readers (RX1); the first screens' worth
  const trust = await readerTrustForBooks(admin, shown.slice(0, 60).map((b) => ({ id: b.id, user_id: b.authorUserId }))).catch(() => new Map());
  const ratings = await ratingsFor(admin, shown.slice(0, 200).map((b) => b.id)).catch(() => new Map<string, { avg: number; count: number }>());

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-3xl">Published books</h1>
        <p className="font-ui mt-1 text-sm text-muted">
          Finished novels from Novelist Writer authors.
        </p>

        {!genre && launching.length > 0 && (
          <div className="mt-8 border-b border-line pb-10">
            <LaunchingThisWeek books={launching} />
          </div>
        )}

        {(genres.length > 1 || audio.size > 0) && (
          <div className="font-ui mt-6 flex flex-wrap gap-2 text-xs">
            <Link
              href="/books"
              className={`border px-2.5 py-1 ${!genre && !audioOnly ? "border-accent text-ink" : "border-line text-muted hover:text-ink"}`}
            >
              All
            </Link>
            {audio.size > 0 && (
              <Link
                href={audioOnly ? "/books" : "/books?format=audiobook"}
                className={`border px-2.5 py-1 ${audioOnly ? "border-accent text-ink" : "border-line text-muted hover:text-ink"}`}
              >
                Audiobooks
              </Link>
            )}
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

        {hidden > 0 && (
          <p className="font-ui mt-4 text-xs text-muted">
            {hidden} book{hidden === 1 ? " is" : "s are"} hidden because of your{" "}
            <Link href="/library" className="text-accent underline">
              content filters
            </Link>
            .
          </p>
        )}

        {shown.length === 0 ? (
          <p className="font-ui mt-10 text-sm text-muted">{hidden > 0 ? "Every book here matches your content filters." : "No published books yet."}</p>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
            {shown.map((b) => (
              <li key={b.id}>
                <Link href={b.href} className="group block">
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
                  {ratings.get(b.id) && (
                    <p className="font-ui text-[11px] text-muted">
                      <span className="text-accent">★</span> {ratings.get(b.id)!.avg.toFixed(1)} ({ratings.get(b.id)!.count})
                    </p>
                  )}
                  {audio.get(b.id) && (
                    <p className="font-ui text-[11px] text-accent">
                      Audiobook · {audio.get(b.id)!.recordedHere ? "Recorded in Novelist Writer" : audio.get(b.id)!.humanNarrated ? "human narrated" : `${audio.get(b.id)!.hours.toFixed(1)} hr`}
                    </p>
                  )}
                </Link>
                <div className="mt-1">
                  <CompactTrust trust={trust.get(b.id)?.trust} record={trust.get(b.id)?.record} />
                </div>
                <div className="mt-1">
                  <TbrButton projectId={b.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <ReaderDigestCta />
      </main>
      <PublicFooter />
    </div>
  );
}

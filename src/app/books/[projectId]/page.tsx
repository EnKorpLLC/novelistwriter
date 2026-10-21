import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPublishedBook } from "@/lib/public-books";
import { normalizePublicLinks, publicLinkList } from "@/lib/public-profile";
import { PublicHeader } from "@/components/PublicHeader";
import { AuthorLinks } from "@/components/AuthorConnect";
import { TrustBadges } from "@/components/TrustBadges";
import { trustBadgesForBook } from "@/lib/trust-badges";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const book = await getPublishedBook(createServiceClient(), projectId);
  return { title: book ? `${book.title} by ${book.authorName}` : "Book not found" };
}

export default async function PublishedBookPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const admin = createServiceClient();
  const book = await getPublishedBook(admin, projectId);
  if (!book) notFound();

  const { data: author } = await admin
    .from("profiles")
    .select("public_links")
    .eq("id", book.authorUserId)
    .maybeSingle();
  const authorLinks = publicLinkList(normalizePublicLinks(author?.public_links));
  const trust = await trustBadgesForBook(admin, book.authorUserId, book.id);

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/books" className="font-ui text-xs text-accent underline">
          ← Published books
        </Link>
        <div className="mt-6 grid gap-8 md:grid-cols-[14rem_1fr]">
          <div className="aspect-[2/3] w-56 max-w-full overflow-hidden border border-line bg-paper-deep">
            {book.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.coverUrl} alt={`Cover of ${book.title}`} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-4xl leading-tight">{book.title}</h1>
            <p className="font-ui mt-2 text-sm text-muted">
              by{" "}
              <Link href={`/authors/${book.authorUserId}`} className="text-ink hover:text-accent">
                {book.authorName}
              </Link>
            </p>
            <TrustBadges {...trust} className="mt-3" />

            <p className="font-ui mt-5 text-[10px] uppercase tracking-wide text-muted">Genre</p>
            <p className="font-ui text-sm text-ink">{book.genre}</p>

            {book.tropes.length > 0 && (
              <>
                <p className="font-ui mt-4 text-[10px] uppercase tracking-wide text-muted">Tropes</p>
                <ul className="font-ui mt-1 flex flex-wrap gap-2 text-xs">
                  {book.tropes.map((t) => (
                    <li key={t} className="border border-line px-2 py-0.5 text-ink">
                      {t}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {book.blurb && (
              <p className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-ink">{book.blurb}</p>
            )}

            {book.buyLinks.length > 0 && (
              <div className="font-ui mt-8 flex flex-wrap gap-3">
                {book.buyLinks.map((l) => (
                  <a
                    key={`${l.label}-${l.url}`}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-accent px-4 py-2 text-sm text-paper hover:bg-accent-soft"
                  >
                    Buy on {l.label}
                  </a>
                ))}
              </div>
            )}

            {authorLinks.length > 0 && (
              <div className="mt-8 border-t border-line pt-5">
                <p className="font-ui text-[10px] uppercase tracking-wide text-muted">
                  Find {book.authorName} online
                </p>
                <AuthorLinks links={authorLinks} className="mt-2" />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

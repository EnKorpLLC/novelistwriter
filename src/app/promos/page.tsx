import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { ReaderDigestCta } from "@/components/ReaderDigestCta";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadPublicPromos, promoPath } from "@/lib/cross-promo";
import { contentMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = contentMetadata({
  title: "Book promotions: deals and new reads from indie authors",
  description: "Themed collections of books from independent authors, with deals, new releases, and favorites by genre. Updated as new promotions start.",
  path: "/promos",
  kicker: "Book promotions",
});

function range(a: string, b: string) {
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return a === b ? f(a) : `${f(a)} – ${f(b)}`;
}

export default async function PromosPage() {
  let promos: Awaited<ReturnType<typeof loadPublicPromos>> = [];
  try {
    promos = await loadPublicPromos(createServiceClient(), { current: true });
  } catch {
    promos = [];
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Book promotions</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Find your next read</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Independent authors team up around a genre or a theme. Every book here was written by its author, and many are
          on sale for the promotion.
        </p>
        {promos.length === 0 ? (
          <p className="font-ui mt-10 text-sm text-muted">
            No promotions are running right now. Browse{" "}
            <Link href="/books" className="text-accent underline">
              published books
            </Link>{" "}
            in the meantime.
          </p>
        ) : (
          <ul className="mt-10 grid gap-6 md:grid-cols-2">
            {promos.map((p) => (
              <li key={p.id} className="border border-line p-5">
                <p className="font-ui text-[11px] uppercase tracking-wide text-accent">
                  {p.startsOn > today ? "Starts " : ""}
                  {range(p.startsOn, p.endsOn)}
                  {p.genre ? ` · ${p.genre}` : ""}
                </p>
                <Link href={promoPath(p.slug)} className="font-display mt-1 block text-2xl hover:text-accent">
                  {p.title}
                </Link>
                <div className="mt-3 flex gap-2">
                  {p.books.slice(0, 5).map((b) =>
                    b.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={b.id} src={b.coverUrl} alt={b.title} className="h-24 w-16 object-cover shadow" />
                    ) : null
                  )}
                </div>
                <p className="font-ui mt-3 text-sm text-muted">{p.books.length} books</p>
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

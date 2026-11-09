import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadPublicPromos, promoPath } from "@/lib/cross-promo";

export const revalidate = 600;

type Params = { slug: string };

async function load(slug: string) {
  try {
    return (await loadPublicPromos(createServiceClient(), { slug }))[0] || null;
  } catch {
    return null;
  }
}

function longDate(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const promo = await load(slug);
  if (!promo) return { title: "Promotion not found" };
  const description = promo.description.slice(0, 200) || `${promo.books.length} books from independent authors${promo.genre ? ` in ${promo.genre}` : ""}.`;
  const image = `/og?${new URLSearchParams({ t: promo.title, k: "Book promotion", s: description.slice(0, 110) }).toString()}`;
  return {
    title: `${promo.title} — Novelist Writer`,
    description,
    alternates: { canonical: promoPath(promo.slug) },
    openGraph: { title: promo.title, description, images: [image] },
    twitter: { card: "summary_large_image", title: promo.title, description, images: [image] },
  };
}

export default async function PromoPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const promo = await load(slug);
  if (!promo) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const ended = promo.endsOn < today;
  const upcoming = promo.startsOn > today;

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-12 md:px-10">
        <Link href="/promos" className="font-ui text-sm text-accent hover:underline">
          ← All promotions
        </Link>
        <p className="font-ui mt-6 text-xs uppercase tracking-[0.2em] text-accent">
          {longDate(promo.startsOn)} – {longDate(promo.endsOn)}
          {promo.genre ? ` · ${promo.genre}` : ""}
        </p>
        <h1 className="font-display mt-2 text-4xl md:text-5xl">{promo.title}</h1>
        {promo.description && <p className="mt-4 max-w-2xl whitespace-pre-line text-lg text-muted">{promo.description}</p>}
        <p className="font-ui mt-3 text-sm text-muted">Put together by {promo.hostName} and the authors below.</p>
        {(ended || upcoming) && (
          <p className="font-ui mt-4 border border-line bg-paper-deep/40 p-3 text-sm">
            {ended ? "This promotion has ended, so prices may be back to normal. The books are still here." : `This promotion starts ${longDate(promo.startsOn)}. Prices may change when it begins.`}
          </p>
        )}

        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {promo.books.map((b) => (
            <li key={b.id} className="flex flex-col">
              <Link href={b.href} className="block">
                {b.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.coverUrl} alt={`${b.title} cover`} className="aspect-[2/3] w-full object-cover shadow-md" />
                ) : (
                  <div className="flex aspect-[2/3] w-full items-center justify-center bg-paper-deep p-4 text-center font-display text-xl">{b.title}</div>
                )}
              </Link>
              <Link href={b.href} className="font-display mt-3 text-xl hover:text-accent">
                {b.title}
              </Link>
              <p className="font-ui text-sm text-muted">by {b.authorName}</p>
              {b.priceNote && !ended && <p className="font-ui mt-1 text-sm font-semibold text-accent">{b.priceNote}</p>}
              {b.blurb && <p className="mt-2 line-clamp-4 text-sm text-muted">{b.blurb}</p>}
              <div className="font-ui mt-3 flex flex-wrap gap-2">
                {b.buyLinks.slice(0, 3).map((l) => (
                  <a
                    key={l.label}
                    href={`/go/${b.id}?s=${encodeURIComponent(l.label)}&src=promo-${promo.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-accent px-3 py-1.5 text-xs text-paper"
                  >
                    {l.label}
                  </a>
                ))}
                {b.buyLinks.length === 0 && (
                  <Link href={b.href} className="border border-line px-3 py-1.5 text-xs text-accent">
                    See the book
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </main>
      <PublicFooter />
    </div>
  );
}

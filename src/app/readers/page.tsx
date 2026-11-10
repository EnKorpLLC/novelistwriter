import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { ShareVisitBeacon } from "@/components/ShareVisitBeacon";
import { InlineText, Lines } from "@/components/Markdown";
import { siteText } from "@/lib/site-text";

export const revalidate = 600;

export const metadata = {
  alternates: { canonical: "/readers" },
  title: "For readers — Novelist Writer",
  description:
    "Read books before anyone else, free. Beta read and get advance copies from indie authors, comment right on the page, and follow the writers you love.",
};

export default async function ReadersPage() {
  const [hero, features, cost] = await Promise.all([siteText("readers.hero"), siteText("readers.features"), siteText("readers.cost")]);
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <ShareVisitBeacon />
      <main>
        <section className="hero-wash border-b border-line px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            {hero.kicker && <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">{hero.kicker}</p>}
            <h1 className="font-display mt-4 text-5xl leading-tight text-ink md:text-6xl">
              <Lines text={hero.heading || ""} />
            </h1>
            {hero.intro && (
              <p className="mt-6 max-w-2xl text-lg text-muted">
                <InlineText text={hero.intro} />
              </p>
            )}
            <div className="font-ui mt-10 flex flex-wrap gap-3">
              <Link href="/beta/signup" className="rounded-sm bg-ink px-6 py-3 text-paper transition hover:bg-accent">
                Create a free reader account
              </Link>
              <Link
                href="/beta/dashboard?tab=catalog"
                className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent"
              >
                Browse open books
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20 md:px-10">
          <h2 className="font-display text-3xl text-ink">{features.heading}</h2>
          <ul className="mt-10 grid gap-8 md:grid-cols-2">
            {(features.items || []).map((f, i) => (
              <li key={`${f.t}-${i}`} className="border-t border-line pt-4">
                <h3 className="font-display text-xl">{f.t}</h3>
                <p className="mt-2 text-sm text-muted">
                  <InlineText text={f.d} />
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-y border-line bg-paper-deep/40 px-6 py-16 md:px-10">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-3xl">{cost.heading}</h2>
            {cost.intro && (
              <p className="mt-3 max-w-2xl text-muted">
                <InlineText text={cost.intro} />
              </p>
            )}
            {cost.note && (
              <p className="mt-3 max-w-2xl text-sm text-muted">
                <InlineText text={cost.note} />
              </p>
            )}
            <div className="font-ui mt-6 flex flex-wrap gap-3 text-sm">
              <Link href="/beta/signup" className="bg-accent px-4 py-2 text-paper">
                Start reading
              </Link>
              <Link href="/books" className="border border-line px-4 py-2 text-accent">
                See published books
              </Link>
              <Link href="/authors" className="self-center text-accent underline">
                I&apos;m a writer
              </Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

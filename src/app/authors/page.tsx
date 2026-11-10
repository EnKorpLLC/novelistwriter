import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { ShareVisitBeacon } from "@/components/ShareVisitBeacon";
import { PlanCards } from "@/components/PlanCards";
import { InlineText, Lines } from "@/components/Markdown";
import { publicOffers } from "@/lib/offers";
import { siteText } from "@/lib/site-text";

export const revalidate = 600;

export const metadata = {
  alternates: { canonical: "/authors" },
  title: "For authors — Novelist Writer",
  description:
    "Write your novel, prove you wrote it, and take it from first draft through beta readers and ARCs to launch. Free to start; Pro and Studio when you're ready.",
};

export default async function AuthorsPage() {
  const [offers, hero, plans, earn, everyPlan, cta] = await Promise.all([
    publicOffers(),
    siteText("authors.hero"),
    siteText("authors.plans"),
    siteText("authors.earn"),
    siteText("authors.every_plan"),
    siteText("authors.cta"),
  ]);
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
              <Link href="/signup" className="rounded-sm bg-ink px-6 py-3 text-paper transition hover:bg-accent">
                Start your first book free
              </Link>
              <Link href="/pricing" className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent">
                Full pricing
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20 md:px-10">
          <h2 className="font-display text-3xl text-ink">{plans.heading}</h2>
          <div className="mt-10">
            <PlanCards offers={offers} />
          </div>
        </section>

        <section className="border-y border-line bg-paper-deep/40 px-6 py-16 md:px-10">
          <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl">{earn.heading}</h2>
              {earn.intro && (
                <p className="mt-3 text-sm text-muted">
                  <InlineText text={earn.intro} />
                </p>
              )}
            </div>
            <div>
              <h2 className="font-display text-2xl">{everyPlan.heading}</h2>
              <ul className="font-ui mt-3 space-y-1.5 text-sm text-muted">
                {(everyPlan.list || []).map((item, i) => (
                  <li key={i}>
                    <InlineText text={item} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16 text-center md:px-10">
          <h2 className="font-display text-3xl">{cta.heading}</h2>
          <div className="font-ui mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="bg-accent px-6 py-3 text-paper">
              Start writing
            </Link>
            <Link href="/readers" className="border border-line px-6 py-3 text-accent">
              What readers get
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

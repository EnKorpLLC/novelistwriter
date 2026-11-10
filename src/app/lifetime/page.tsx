import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";
import { publicOffers } from "@/lib/offers";
import { LIFETIME, PLANS } from "@/lib/plans";

export const revalidate = 600;

export const metadata = contentMetadata({
  title: "Lifetime Pro and Lifetime Studio",
  description: "Pay once for Novelist Writer Pro or Studio, including future features. Limited spots: 300 for Lifetime Pro at $449 and 100 for Lifetime Studio at $1,099.",
  path: "/lifetime",
  kicker: "Lifetime plans",
});

export default async function LifetimePage() {
  const offers = await publicOffers();
  const tiers = (["pro", "studio"] as const).map((t) => ({ t, plan: PLANS.find((p) => p.id === t)!, spots: offers?.lifetime[t] }));
  const soldOut = Boolean(offers) && tiers.every((x) => (x.spots?.left ?? 0) <= 0);

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Lifetime plans</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Pay once. Write here for life.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          A limited number of lifetime plans for writers who want to back Novelist Writer early. You get the plan&apos;s features for as long
          as Novelist Writer runs, including everything we add to that plan later.
        </p>

        {soldOut ? (
          <p className="font-ui mt-10 border border-line p-5">
            Lifetime plans are sold out. Thank you to everyone who backed us early.{" "}
            <Link href="/pricing" className="text-accent underline">
              See current plans
            </Link>
          </p>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {tiers.map(({ t, plan, spots }) => (
              <div key={t} className={`flex flex-col border p-6 ${t === "studio" ? "border-accent" : "border-line"}`}>
                <h2 className="font-display text-2xl">{LIFETIME[t].label}</h2>
                <p className="mt-1 text-3xl">
                  ${(LIFETIME[t].cents / 100).toLocaleString()}
                  <span className="font-ui text-sm text-muted"> once</span>
                </p>
                <p className="font-ui mt-1 text-xs text-muted">
                  Instead of {plan.price} a month.
                  {spots ? ` ${spots.left} of ${spots.cap} spots left.` : ` Limited to ${LIFETIME[t].cap} spots.`}
                </p>
                <ul className="font-ui mt-4 flex-1 space-y-2 text-sm">
                  {plan.items.slice(0, 8).map((i) => (
                    <li key={i} className="border-t border-line pt-2">
                      {i}
                    </li>
                  ))}
                </ul>
                {spots && spots.left <= 0 ? (
                  <p className="font-ui mt-6 text-sm text-muted">Sold out</p>
                ) : (
                  <Link href="/billing" className={`font-ui mt-6 px-4 py-2 text-center text-sm ${t === "studio" ? "bg-accent text-paper" : "border border-line text-accent"}`}>
                    Get {LIFETIME[t].label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        <h2 className="font-display mt-14 text-2xl">Good to know</h2>
        <ul className="font-ui mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Monthly AI critique credits aren&apos;t included. Credit packs are available anytime and never expire.</li>
          <li>If you already subscribe, we stop your subscription at the end of the period you&apos;ve paid for, so you&apos;re never charged twice.</li>
          <li>Lifetime members get a Lifetime member badge on their author page.</li>
          <li>Spots are capped so the plan stays sustainable. When they&apos;re gone, they&apos;re gone.</li>
        </ul>
      </main>
      <PublicFooter />
    </div>
  );
}

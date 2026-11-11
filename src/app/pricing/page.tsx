import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PlanCards } from "@/components/PlanCards";
import { PAY_AS_YOU_GO } from "@/lib/plans";
import { JsonLd } from "@/components/JsonLd";
import { faqJsonLd, softwareJsonLd } from "@/lib/seo";
import { PublicFooter } from "@/components/PublicFooter";
import { COMPARED_ON, REPLACES } from "@/lib/compare";
import { publicOffers } from "@/lib/offers";
import { siteFaq, siteText } from "@/lib/site-text";
import { InlineText } from "@/components/Markdown";
import { dollars, estimateShare } from "@/lib/direct-sale-rules";

export const revalidate = 600;

export const metadata = {
  alternates: { canonical: "/pricing" },
  title: "Pricing — Novelist Writer",
  description:
    "Write free forever. Pro adds your author site, launch pages, unlimited projects, and AI critique credits; Studio adds beta readers, ARCs, reader feedback, and insights. Readers are always free.",
};

export default async function PricingPage() {
  const [offers, hero, faq] = await Promise.all([publicOffers(), siteText("pricing.hero"), siteFaq()]);
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <JsonLd data={[softwareJsonLd(), faqJsonLd(faq)]} />
      <main className="mx-auto max-w-5xl px-6 py-16 md:px-10">
        <h1 className="font-display text-4xl">{hero.heading}</h1>
        {hero.intro && (
          <p className="mt-3 max-w-2xl text-muted">
            <InlineText text={hero.intro} />
          </p>
        )}

        <section className="mt-12">
          <PlanCards offers={offers} />
        </section>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="border border-line p-6">
            <h2 className="font-display text-2xl">Pay as you go</h2>
            <p className="font-ui mt-1 text-sm text-muted">No subscription needed.</p>
            <ul className="font-ui mt-4 space-y-2 text-sm text-ink">
              {PAY_AS_YOU_GO.map((i) => (
                <li key={i} className="border-t border-line pt-2">
                  {i}
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-line p-6">
            <h2 className="font-display text-2xl">Readers: always free</h2>
            <p className="font-ui mt-2 text-sm text-muted">
              Beta reads, advance copies, comments, reader badges, a library with shelves, and a public reader profile cost
              nothing, with no ads. Ebooks readers buy direct are theirs to keep, with no coins or expiring credits.
            </p>
            <Link href="/readers" className="font-ui mt-4 inline-block text-sm text-accent underline-offset-2 hover:underline">
              What readers get →
            </Link>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-3xl">What Novelist Writer replaces</h2>
          <p className="font-ui mt-2 max-w-2xl text-sm text-muted">
            The separate tools many authors pay for today, and the plan that covers each. Typical prices, checked {COMPARED_ON}.
          </p>
          <table className="font-ui mt-6 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2">Tool</th>
                <th>Typical cost</th>
                <th>Included in</th>
              </tr>
            </thead>
            <tbody>
              {REPLACES.map((r) => (
                <tr key={r.tool} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-ink">{r.tool}</td>
                  <td className="pr-3 text-muted">{r.cost}</td>
                  <td className="text-ink">{r.plan === "Free" ? "Every plan" : r.plan === "Pro" ? "Pro and Studio" : "Studio"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="font-ui mt-3 text-sm">
            <Link href="/compare" className="text-accent underline">
              See detailed comparisons
            </Link>
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-3xl">Selling direct to readers</h2>
          <p className="font-ui mt-2 max-w-2xl text-sm text-muted">
            On Pro and Studio, readers can buy your ebook right from your launch page. What you keep per sale, after our fee and Stripe&apos;s card fee.
            Sales tax is added on top at checkout, and we handle it.
          </p>
          <table className="font-ui mt-6 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2">Ebook price</th>
                <th>KDP at 70%</th>
                <th>Pro (10% + 15¢)</th>
                <th>Studio (5% + 15¢)</th>
              </tr>
            </thead>
            <tbody>
              {[299, 499, 999].map((p) => (
                <tr key={p} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-ink">{dollars(p)}</td>
                  <td className="pr-3 text-muted">{dollars(Math.round(p * 0.7))}</td>
                  <td className="pr-3 text-ink">{dollars(estimateShare(p, "pro").authorCents)}</td>
                  <td className="text-ink">{dollars(estimateShare(p, "studio").authorCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="font-ui mt-3 text-xs text-muted">
            KDP pays 70% on ebooks priced $2.99 to $9.99, before its delivery fee. Direct sales are open to US readers for now; your store links stay on the page
            for everyone else. Payouts are monthly once you have $50.{" "}
            <Link href="/seller-terms" className="text-accent underline">
              Seller terms
            </Link>
          </p>
          <p className="font-ui mt-3 text-sm text-ink">
            <strong>Audiobooks</strong> sell direct at the same fees, alone or as ebook + audiobook at one price. So do <strong>pre-orders</strong>, <strong>extras</strong>{" "}
            (character art, maps, bonus stories), <strong>box sets</strong> (Studio), and <strong>your shop</strong> of signed books, bookmarks, and prints you ship, where
            you also keep the shipping you charge. <strong>Paperbacks printed on demand</strong> open soon: you&apos;ll keep the price less printing and the same fee.
          </p>
          <p className="font-ui mt-3 text-sm text-ink">
            <strong>Hiring a narrator</strong> (Studio): our fee is 10% of the
            narration fee, paid by you on top, so the narrator gets their full rate; narrators never pay.{" "}
            <Link href="/narrators" className="text-accent underline">
              How it works for narrators
            </Link>
          </p>
          <p className="font-ui mt-3 text-sm text-ink">
            <strong>Hiring an editor, proofreader, cover designer, or artist</strong> (every plan): the same 10%, paid by you and shown on the quote, so the pro gets their
            full price. Each milestone is held until you approve it.{" "}
            <Link href="/hire" className="text-accent underline">
              Hire help
            </Link>
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-3xl">Questions</h2>
          <dl className="mt-6 space-y-6">
            {faq.map((f) => (
              <div key={f.q} className="border-t border-line pt-4">
                <dt className="font-display text-xl text-ink">{f.q}</dt>
                <dd className="mt-2 max-w-3xl text-sm text-muted">
                  <InlineText text={f.a} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="font-ui mt-12 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-sm bg-accent px-6 py-3 text-paper hover:bg-accent-soft">
            Start free
          </Link>
          <Link
            href="/authors"
            className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent"
          >
            What authors get
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

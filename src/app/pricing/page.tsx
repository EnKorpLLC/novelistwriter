import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PlanCards } from "@/components/PlanCards";
import { PAY_AS_YOU_GO, PRICING_FAQ } from "@/lib/plans";
import { JsonLd } from "@/components/JsonLd";
import { faqJsonLd, softwareJsonLd } from "@/lib/seo";
import { PublicFooter } from "@/components/PublicFooter";
import { COMPARED_ON, REPLACES } from "@/lib/compare";

export const metadata = {
  alternates: { canonical: "/pricing" },
  title: "Pricing — Novelist Writer",
  description:
    "Write free forever. Pro adds your author site, launch pages, unlimited projects, and AI critique credits; Studio adds beta readers, ARCs, reader feedback, and insights. Readers are always free.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <JsonLd data={[softwareJsonLd(), faqJsonLd()]} />
      <main className="mx-auto max-w-5xl px-6 py-16 md:px-10">
        <h1 className="font-display text-4xl">Pricing</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Write free forever. Your first book is free, and every plan keeps a record of how you wrote it
          and lets you switch AI off entirely. AI critiques craft; it never writes your novel.
        </p>

        <section className="mt-12">
          <PlanCards />
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
              Beta reads, advance copies, comments, reader badges, and a public reader profile cost
              nothing, with no ads.
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
          <h2 className="font-display text-3xl">Questions</h2>
          <dl className="mt-6 space-y-6">
            {PRICING_FAQ.map((f) => (
              <div key={f.q} className="border-t border-line pt-4">
                <dt className="font-display text-xl text-ink">{f.q}</dt>
                <dd className="mt-2 max-w-3xl text-sm text-muted">{f.a}</dd>
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

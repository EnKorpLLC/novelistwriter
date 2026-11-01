import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PlanCards } from "@/components/PlanCards";
import { PAY_AS_YOU_GO, PRICING_FAQ } from "@/lib/plans";

export const metadata = {
  title: "Pricing — Novelist Writer",
  description:
    "Write free forever. Pro for unlimited projects and AI critique credits; Studio for beta readers, ARCs, reader feedback, and insights. Readers are always free.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
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
    </div>
  );
}

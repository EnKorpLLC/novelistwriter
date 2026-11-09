import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { COMPARED_ON, COMPARISONS, SWITCH_GUIDES } from "@/lib/compare";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "Novelist Writer compared, and how to switch",
  description: "Fair comparisons with Scrivener, Vellum, Atticus, BetaBooks, and NetGalley, plus step-by-step guides for bringing your book over.",
  path: "/compare",
  kicker: "Compare",
});

export default function ComparePage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-14 md:px-10">
        <h1 className="font-display text-5xl leading-tight">Compare, and switch</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Honest comparisons, including when another tool is the better choice. Checked {COMPARED_ON}.
        </p>
        <section className="mt-10">
          <h2 className="font-display text-2xl">Novelist Writer vs</h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {COMPARISONS.map((c) => (
              <li key={c.slug} className="border border-line p-4">
                <Link href={`/compare/${c.slug}`} className="font-display text-xl hover:text-accent">
                  {c.name}
                </Link>
                <p className="mt-1 text-sm text-muted">{c.what}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-12">
          <h2 className="font-display text-2xl">Switching from</h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-4">
            {SWITCH_GUIDES.map((s) => (
              <li key={s.slug}>
                <Link href={`/switch/${s.slug}`} className="block border border-line p-4 hover:border-accent">
                  <span className="font-display text-lg">{s.name}</span>
                  <span className="mt-1 block text-xs text-muted">Bring your book over</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

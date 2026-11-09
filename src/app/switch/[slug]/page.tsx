import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { WriteHereCta } from "@/components/WriteHereCta";
import { COMPARISONS, SWITCH_GUIDES } from "@/lib/compare";
import { contentMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return SWITCH_GUIDES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = SWITCH_GUIDES.find((x) => x.slug === slug);
  if (!g) return {};
  return contentMetadata({
    title: `Switching from ${g.name} to Novelist Writer`,
    description: `How to bring your book over from ${g.name}: export, import, what maps to what, and a short checklist.`,
    path: `/switch/${g.slug}`,
    kicker: "Switching guide",
  });
}

export default async function SwitchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = SWITCH_GUIDES.find((x) => x.slug === slug);
  if (!g) notFound();
  const compare = COMPARISONS.find((c) => c.switchSlug === g.slug);

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-12 md:px-10">
        <Link href="/compare" className="font-ui text-sm text-accent hover:underline">
          ← Compare and switch
        </Link>
        <h1 className="font-display mt-4 text-4xl">Switching from {g.name}</h1>
        <p className="mt-3 text-muted">{g.intro}</p>

        <h2 className="font-display mt-10 text-2xl">Bring your book over</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink">
          {g.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>

        <h2 className="font-display mt-10 text-2xl">What goes where</h2>
        <table className="font-ui mt-3 w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2">In {g.name}</th>
              <th>In Novelist Writer</th>
            </tr>
          </thead>
          <tbody>
            {g.maps.map(([a, b]) => (
              <tr key={a} className="border-b border-line/60">
                <td className="py-2 pr-3 text-ink">{a}</td>
                <td className="text-muted">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="font-display mt-10 text-2xl">Quick checklist</h2>
        <ul className="font-ui mt-3 space-y-1 text-sm">
          {g.checklist.map((c) => (
            <li key={c}>○ {c}</li>
          ))}
        </ul>
        <p className="font-ui mt-6 text-sm text-muted">
          Something didn&apos;t come through right?{" "}
          <Link href="/contact" className="text-accent underline">
            Send us a note
          </Link>{" "}
          and we&apos;ll help, and improve the import.
          {compare && (
            <>
              {" "}
              <Link href={`/compare/${compare.slug}`} className="text-accent underline">
                See how we compare with {compare.name}
              </Link>
              .
            </>
          )}
        </p>
        <WriteHereCta line="Your first book is free, and your writing record starts the day you start writing here." />
      </main>
      <PublicFooter />
    </div>
  );
}

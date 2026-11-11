import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { WriteHereCta } from "@/components/WriteHereCta";
import { COMPARED_ON, COMPARISONS, FEATURES, NOVELIST_WRITER, type Mark } from "@/lib/compare";
import { contentMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = COMPARISONS.find((x) => x.slug === slug);
  if (!c) return {};
  return contentMetadata({
    title: `Novelist Writer vs ${c.name}`,
    description: `A fair comparison of Novelist Writer and ${c.name}: features, price, and who each one suits best. Checked ${COMPARED_ON}.`,
    path: `/compare/${c.slug}`,
    kicker: "Compare",
  });
}

const SYMBOL: Record<Mark, { s: string; cls: string; label: string }> = {
  yes: { s: "✓", cls: "text-accent", label: "Yes" },
  partial: { s: "◐", cls: "text-ink", label: "Partly" },
  no: { s: "—", cls: "text-muted", label: "No" },
};

function Cell({ v }: { v: [Mark, string?] }) {
  const m = SYMBOL[v[0]];
  return (
    <td className="py-2 pr-3 align-top">
      <span className={m.cls} aria-label={m.label}>
        {m.s}
      </span>
      {v[1] && <span className="block text-xs text-muted">{v[1]}</span>}
    </td>
  );
}

export default async function CompareOne({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = COMPARISONS.find((x) => x.slug === slug);
  if (!c) notFound();

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-12 md:px-10">
        <Link href="/compare" className="font-ui text-sm text-accent hover:underline">
          ← All comparisons
        </Link>
        <h1 className="font-display mt-4 text-4xl">Novelist Writer vs {c.name}</h1>
        <p className="mt-3 max-w-2xl text-muted">{c.what}</p>
        <table className="font-ui mt-8 w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2" />
              <th className="py-2">Novelist Writer</th>
              <th className="py-2">{c.name}</th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f} className="border-b border-line/60">
                <td className="py-2 pr-3 align-top text-ink">{f}</td>
                <Cell v={NOVELIST_WRITER.marks[f]} />
                <Cell v={c.marks[f]} />
              </tr>
            ))}
            {(c.extraRows || []).map(([f, us, them]) => (
              <tr key={f} className="border-b border-line/60">
                <td className="py-2 pr-3 align-top text-ink">{f}</td>
                <Cell v={us} />
                <Cell v={them} />
              </tr>
            ))}
            <tr>
              <td className="py-2 pr-3 align-top text-ink">Price</td>
              <td className="py-2 pr-3 align-top">{NOVELIST_WRITER.price}</td>
              <td className="py-2 pr-3 align-top">{c.price}</td>
            </tr>
          </tbody>
        </table>
        <p className="font-ui mt-2 text-xs text-muted">
          Checked {COMPARED_ON} from public information. Prices and features change, so check {c.name}&apos;s site for current
          details. Something wrong?{" "}
          <Link href="/contact" className="text-accent underline">
            Tell us
          </Link>{" "}
          and we&apos;ll fix it.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <section className="border border-line p-5">
            <h2 className="font-display text-xl">Choose {c.name} if</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {c.chooseThem.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          <section className="border border-accent/40 p-5">
            <h2 className="font-display text-xl">Choose Novelist Writer if</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {c.chooseUs.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        </div>
        {c.switchSlug && (
          <p className="font-ui mt-6 text-sm">
            <Link href={`/switch/${c.switchSlug}`} className="text-accent underline">
              How to bring your book over from {c.name}
            </Link>
          </p>
        )}
        <WriteHereCta />
      </main>
      <PublicFooter />
    </div>
  );
}

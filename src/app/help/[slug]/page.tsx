import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { JsonLd } from "@/components/JsonLd";
import { InlineText } from "@/components/Markdown";
import { breadcrumbJsonLd, contentMetadata, faqJsonLd } from "@/lib/seo";
import { HELP_ARTICLES, HELP_AUDIENCES, HELP_BY_SLUG } from "@/lib/help";
import { siteHelp } from "@/lib/site-text";

export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

const plain = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const base = HELP_BY_SLUG.get((await params).slug);
  if (!base) return {};
  const a = await siteHelp(base);
  return contentMetadata({ title: a.title, description: plain(a.summary), path: `/help/${a.slug}`, kicker: "Help" });
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const base = HELP_BY_SLUG.get((await params).slug);
  if (!base) notFound();
  const a = await siteHelp(base);
  const audience = HELP_AUDIENCES.find((x) => x.id === a.audience)!;
  const related = (a.related || []).map((s) => HELP_BY_SLUG.get(s)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  const faq = a.faq || [];

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Help", path: "/help" },
            { name: a.title, path: `/help/${a.slug}` },
          ]),
          ...(faq.length ? [faqJsonLd(faq.map((f) => ({ q: f.q, a: plain(f.a) })))] : []),
        ]}
      />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <nav className="font-ui text-xs text-muted" aria-label="Breadcrumb">
          <Link href="/help" className="hover:text-ink">
            Help
          </Link>{" "}
          ·{" "}
          <Link href={`/help#${audience.id}`} className="hover:text-ink">
            For {audience.label.toLowerCase()}
          </Link>{" "}
          · {a.topic}
        </nav>
        <h1 className="font-display mt-3 text-4xl leading-tight md:text-5xl">{a.title}</h1>
        <p className="mt-4 text-lg text-muted">
          <InlineText text={a.summary} />
        </p>
        <div className="font-ui mt-5 flex flex-wrap items-center gap-3 text-sm">
          {a.plan && <span className="border border-line px-2.5 py-1 text-muted">{a.plan}</span>}
          {a.open && (
            <Link href={a.open.href} className="rounded-sm bg-accent px-4 py-2 text-paper transition hover:bg-accent-soft">
              {a.open.label}
            </Link>
          )}
        </div>

        <section className="mt-10">
          <h2 className="font-display text-2xl">How to do it</h2>
          <ol className="mt-4 space-y-4">
            {a.steps.map((s, i) => (
              <li key={`${i}-${s.slice(0, 24)}`} className="flex gap-4">
                <span className="font-ui flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm text-accent">{i + 1}</span>
                <p className="pt-0.5">
                  <InlineText text={s} />
                </p>
              </li>
            ))}
          </ol>
        </section>

        {a.tips && a.tips.length > 0 && (
          <section className="mt-12 border-t border-line pt-6">
            <h2 className="font-display text-2xl">Good to know</h2>
            <ul className="mt-4 grid gap-6 sm:grid-cols-2">
              {a.tips.map((t) => (
                <li key={t.t}>
                  <h3 className="font-display text-lg">{t.t}</h3>
                  <p className="mt-1 text-sm text-muted">
                    <InlineText text={t.d} />
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {faq.length > 0 && (
          <section className="mt-12 border-t border-line pt-6">
            <h2 className="font-display text-2xl">Questions</h2>
            <dl className="mt-4 space-y-5">
              {faq.map((f) => (
                <div key={f.q}>
                  <dt className="font-display text-lg">{f.q}</dt>
                  <dd className="mt-1 text-muted">
                    <InlineText text={f.a} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {related.length > 0 && (
          <section className="font-ui mt-12 border-t border-line pt-6 text-sm">
            <h2 className="font-display text-xl">Related</h2>
            <ul className="mt-2 space-y-1">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/help/${r.slug}`} className="text-accent underline">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-12 border-t border-line pt-6 text-muted">
          Still stuck?{" "}
          <Link href="/contact" className="text-accent underline">
            Contact us
          </Link>{" "}
          and a person will answer.{" "}
          <Link href="/help" className="text-accent underline">
            All help articles
          </Link>
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { Markdown } from "@/components/Markdown";
import { WriteHereCta } from "@/components/WriteHereCta";
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/seo";
import { appUrl } from "@/lib/stripe";
import { contentPath, longDate, type ContentPage } from "@/lib/content";

/** A guide, report, or site page: the answer first, then the details, a short FAQ, and the updated date. */
export function ContentArticle({ page, back }: { page: Pick<ContentPage, "kind" | "slug" | "title" | "summary" | "body" | "faq" | "author_name" | "related_path" | "related_label" | "data" | "published_at" | "updated_at">; back?: { href: string; label: string } }) {
  const path = contentPath(page.kind, page.slug);
  const article = {
    "@context": "https://schema.org",
    "@type": page.kind === "report" ? "Report" : "Article",
    headline: page.title,
    description: page.summary,
    url: appUrl(path),
    datePublished: page.published_at || undefined,
    dateModified: page.updated_at,
    author: page.author_name ? { "@type": "Person", name: page.author_name } : { "@type": "Organization", name: "Novelist Writer" },
    publisher: { "@type": "Organization", name: "Novelist Writer", url: appUrl("/") },
  };
  return (
    <article className="mx-auto max-w-3xl px-6 py-12 md:px-10">
      <JsonLd
        data={[
          article,
          ...(page.faq.length ? [faqJsonLd(page.faq)] : []),
          ...(back ? [breadcrumbJsonLd([{ name: back.label, path: back.href }, { name: page.title, path }])] : []),
        ]}
      />
      {back && (
        <Link href={back.href} className="font-ui text-sm text-accent hover:underline">
          ← {back.label}
        </Link>
      )}
      <h1 className="font-display mt-4 text-4xl leading-tight md:text-5xl">{page.title}</h1>
      <p className="font-ui mt-3 text-xs text-muted">
        {page.author_name ? `By ${page.author_name} · ` : ""}Updated {longDate(page.updated_at)}
      </p>
      {page.summary && (
        <div className="mt-6 border-l-4 border-accent bg-paper-deep/40 p-4">
          <p className="font-ui text-[11px] uppercase tracking-wide text-accent">The short answer</p>
          <p className="mt-1 text-lg leading-relaxed text-ink">{page.summary}</p>
        </div>
      )}

      {page.data?.sections?.length ? (
        <section className="font-ui mt-8 space-y-8">
          {page.data.sections.map((s) => (
            <div key={s.title}>
              <h2 className="font-display text-2xl">{s.title}</h2>
              {s.note && <p className="mt-1 text-xs text-muted">{s.note}</p>}
              <ul className="mt-3 space-y-2">
                {s.rows.map((r) => (
                  <li key={r.label} className="text-sm">
                    <div className="flex justify-between gap-3">
                      <span>{r.label}</span>
                      <span className="font-semibold">{r.display}</span>
                    </div>
                    {r.value > 0 && r.value <= 1 && (
                      <div className="mt-1 h-2 bg-paper-deep">
                        <div className="h-2 bg-accent" style={{ width: `${Math.round(r.value * 100)}%` }} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-muted">
            Anonymous totals from Novelist Writer, {page.data.period}. Every number stands for at least {page.data.minGroup} people, so no author or reader can be
            identified. Cite as: &ldquo;{page.title}, Novelist Writer, {longDate(page.data.generatedAt)}&rdquo; with a link to this page.
          </p>
        </section>
      ) : null}

      <Markdown source={page.body} className="text-ink" />

      {page.faq.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl">Questions</h2>
          <dl className="mt-4 space-y-5">
            {page.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-display text-lg">{f.q}</dt>
                <dd className="mt-1 text-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {page.related_path && (
        <p className="font-ui mt-10 text-sm">
          <Link href={page.related_path} className="text-accent underline">
            {page.related_label || "Related"} →
          </Link>
        </p>
      )}
      <WriteHereCta line="Novelist Writer keeps a record of how your book was written, formats it for print and every store, and runs beta readers, ARCs, and your launch. AI only critiques; it never writes." />
    </article>
  );
}

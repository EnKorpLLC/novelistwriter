import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/admin";
import { getLaunchBook, resolveAuthor } from "@/lib/public-site";
import { userHasStudio } from "@/lib/credits";
import { authorPath, bookPath } from "@/lib/handles";
import { themeStyle } from "@/lib/site-themes";
import { PublicHeader } from "@/components/PublicHeader";
import { GuestListSignup } from "@/components/GuestListSignup";
import { normalizeDetails, normalizeFormat } from "@/lib/book/format";
import { buildBook } from "@/lib/book/model";
import { renderChapter } from "@/lib/book/render";
import { FONTS, getStyle } from "@/lib/book/styles";
import { normalizeLaunchPlan } from "@/lib/launch-plan";

export const dynamic = "force-dynamic";

type Params = { handle: string; slug: string };

async function load(handle: string, slug: string) {
  const admin = createServiceClient();
  const author = await resolveAuthor(admin, handle);
  if (!author?.sitePublic) return null;
  const book = await getLaunchBook(admin, author.userId, slug);
  if (!book) return null;
  const [studio, { data: project }] = await Promise.all([userHasStudio(author.userId), admin.from("projects").select("*").eq("id", book.id).maybeSingle()]);
  const plan = normalizeLaunchPlan(project?.launch_plan);
  if (!studio || !project || !plan.sample.on) return null;
  return { admin, author, book, project, plan };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { handle, slug } = await params;
  const data = await load(handle, slug);
  if (!data) return {};
  return {
    title: `Read a sample of ${data.book.title} by ${data.author.name}`,
    description: data.book.tagline || data.book.blurb.slice(0, 160),
    alternates: { canonical: `${bookPath(data.author.handle, data.book.slug)}/sample` },
  };
}

/** L6: one chapter of the book, styled like the book, with the buy or notify buttons after it. */
export default async function SamplePage({ params }: { params: Promise<Params> }) {
  const { handle, slug } = await params;
  const data = await load(handle, slug);
  if (!data) notFound();
  const { admin, author, book, project, plan } = data;

  const { data: chapters } = await admin.from("chapters").select("id, title, sort_order").eq("project_id", book.id).order("sort_order");
  const list = chapters || [];
  const chosen = list.find((c) => c.id === plan.sample.chapterId) || list[0];
  if (!chosen) notFound();
  const { data: content } = await admin.from("chapters").select("content_html, content_text").eq("id", chosen.id).maybeSingle();

  const format = normalizeFormat(project.format_settings);
  const style = getStyle(format.style);
  // Every chapter's title goes in so numbering matches the book; only the sample's text is parsed
  const built = buildBook({
    title: book.title,
    author: author.name,
    details: normalizeDetails(project.book_details),
    format,
    styleHeadingFormat: style.headingFormat,
    chapters: list.map((c) => ({
      id: c.id,
      title: c.title || "",
      sort_order: c.sort_order,
      content_html: c.id === chosen.id ? content?.content_html || "" : "",
      content_text: c.id === chosen.id ? content?.content_text || "" : "",
    })),
    matter: [],
  });
  const chapter = built.chapters.find((c) => c.id === chosen.id);
  if (!chapter) notFound();
  const html = renderChapter(chapter, built, style).replace(/ epub:type="[^"]*"/g, "");

  const body = FONTS[style.body];
  const heading = FONTS[style.heading];
  const upper = style.headingUpper ? "text-transform: uppercase;" : "";
  const css = `
@font-face { font-family: "NWS Body"; src: url("${body.regular}"); font-weight: 300 800; }
${body.italic ? `@font-face { font-family: "NWS Body"; src: url("${body.italic}"); font-style: italic; font-weight: 300 800; }` : ""}
@font-face { font-family: "NWS Heading"; src: url("${heading.regular}"); font-weight: 300 800; }
.book-sample { font-family: "NWS Body", Georgia, serif; font-size: 1.15rem; line-height: 1.7; color: #1d1a16; }
.book-sample p { margin: 0; text-indent: 1.5em; text-align: justify; hyphens: auto; }
.book-sample p.first, .book-sample p.center, .book-sample p.scene-break { text-indent: 0; }
.book-sample p.center { text-align: center; }
.book-sample p.scene-break { text-align: center; margin: 1.4em 0; letter-spacing: 0.2em; }
.book-sample .dropcap { float: left; font-family: "NWS Heading", Georgia, serif; font-size: 3.6em; line-height: 0.85; margin: 0.06em 0.08em 0 0; }
.book-sample .lead { font-variant: small-caps; letter-spacing: 0.04em; }
.book-sample .chapter-head { text-align: ${style.headingAlign}; margin: 1rem 0 2.5rem; }
.book-sample .chapter-label { font-family: "NWS Heading", Georgia, serif; text-indent: 0; letter-spacing: ${style.labelSpacing}em; ${upper} margin: 0 0 0.4em; text-align: ${style.headingAlign}; }
.book-sample .chapter-title { font-family: "NWS Heading", Georgia, serif; font-size: 2rem; line-height: 1.2; margin: 0; ${style.titleItalic ? "font-style: italic;" : ""} ${upper} }
.book-sample blockquote { margin: 1em 2em; }
.book-sample h2, .book-sample h3, .book-sample h4 { font-family: "NWS Heading", Georgia, serif; text-align: ${style.headingAlign}; margin: 1.4em 0 0.6em; }
`;
  const path = bookPath(author.handle, book.slug);
  const links = book.published ? book.buyLinks : book.preorderLinks;

  return (
    <div className="min-h-screen" style={themeStyle(author.theme)}>
      <PublicHeader />
      <style>{css}</style>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <Link href={path} className="font-ui text-sm text-accent hover:underline">
          ← {book.title}
        </Link>
        <p className="font-ui mt-4 text-xs uppercase tracking-wide text-muted">
          A sample from {book.title} by{" "}
          <Link href={authorPath(author.handle)} className="hover:text-accent">
            {author.name}
          </Link>
        </p>
        <article className="book-sample mt-6" dangerouslySetInnerHTML={{ __html: html }} />

        <section className="font-ui mt-12 border-t border-line pt-8">
          <h2 className="font-display text-2xl">Want to keep reading?</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {links.map((l) => (
              <a key={`${l.label}-${l.url}`} href={`/go/${book.id}?s=${encodeURIComponent(l.label)}`} target="_blank" rel="noopener noreferrer" className="bg-accent px-4 py-2 text-sm text-paper">
                {book.published ? "Buy on" : "Preorder on"} {l.label}
              </a>
            ))}
            <Link href={path} className="border border-line px-4 py-2 text-sm text-ink">
              About the book
            </Link>
          </div>
          <div className="mt-8">
            <GuestListSignup
              authorUserId={author.userId}
              authorName={author.name}
              heading={book.published ? `More from ${author.name}` : `Get notified when ${book.title} is out`}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

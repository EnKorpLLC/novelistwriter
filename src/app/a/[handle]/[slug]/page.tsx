import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getLaunchBook, resolveAuthor } from "@/lib/public-site";
import { trustBadgesForBook } from "@/lib/trust-badges";
import { userHasStudio } from "@/lib/credits";
import { authorPath, bookPath } from "@/lib/handles";
import { themeStyle } from "@/lib/site-themes";
import { PublicHeader } from "@/components/PublicHeader";
import { AuthorLinks } from "@/components/AuthorConnect";
import { TrustBadges } from "@/components/TrustBadges";
import { GuestListSignup } from "@/components/GuestListSignup";
import { OwnerBar, PreviewBar } from "@/components/OwnerBar";
import { VisitorShareButton } from "@/components/ShareKit";
import { ShareVisitBeacon } from "@/components/ShareVisitBeacon";
import { RecordBadge } from "@/components/WritingRecordView";
import { computeWritingRecord } from "@/lib/writing-record";

export const dynamic = "force-dynamic";

type Params = { handle: string; slug: string };

function longDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { handle, slug } = await params;
  const admin = createServiceClient();
  const author = await resolveAuthor(admin, handle);
  const book = author ? await getLaunchBook(admin, author.userId, slug) : null;
  if (!author || !book) return { title: "Book not found" };
  const title = `${book.title} by ${author.name}`;
  const description = (book.tagline || book.blurb).slice(0, 200) || `A novel by ${author.name}.`;
  return { title, description, openGraph: { title, description, type: "book" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function LaunchPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { handle, slug } = await params;
  const { preview } = await searchParams;
  const admin = createServiceClient();
  const author = await resolveAuthor(admin, handle);
  if (!author) notFound();
  const book = await getLaunchBook(admin, author.userId, slug);
  if (!book) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === author.userId;
  const previewing = isOwner && preview === "visitor";
  const [trust, studio, { data: recordFlag }] = await Promise.all([
    trustBadgesForBook(admin, author.userId, book.id),
    userHasStudio(author.userId),
    admin.from("projects").select("record_public").eq("id", book.id).maybeSingle(),
  ]);
  const path = bookPath(author.handle, book.slug);
  const recordPublic = Boolean(recordFlag?.record_public);
  const record = recordPublic ? await computeWritingRecord(admin, book.id) : null;

  const stageLine =
    book.stage === "published"
      ? "Out now"
      : book.stage === "arc"
        ? "Advance copies available"
        : book.stage === "beta"
          ? "Looking for beta readers"
          : book.releaseDate
            ? `Coming ${longDate(book.releaseDate)}`
            : "Coming soon";

  const posts =
    book.stage === "published"
      ? [
          { label: "Release", text: `${book.title} is out now!` },
          { label: "Short", text: `New book: ${book.title}.` },
        ]
      : book.stage === "arc"
        ? [{ label: "ARC call", text: `Advance copies of ${book.title} are open. Read it free before release.` }]
        : book.stage === "beta"
          ? [{ label: "Beta call", text: `I'm looking for beta readers for ${book.title}.` }]
          : [
              {
                label: "Cover reveal",
                text: `${book.title}${book.releaseDate ? `, coming ${longDate(book.releaseDate)}` : ", coming soon"}.`,
              },
            ];

  return (
    <div className="min-h-screen" style={themeStyle(author.theme)}>
      <ShareVisitBeacon />
      <PublicHeader />
      {isOwner && !previewing && (
        <OwnerBar
          label="This is your book's launch page."
          editHref={`/project/${book.id}?tab=publish`}
          previewHref={`${path}?preview=visitor`}
          sharePath={path}
          title={`${book.title} by ${author.name}`}
          posts={posts}
          newsletter={{
            heading: book.title,
            body: book.tagline || book.blurb.slice(0, 280) || stageLine,
            buttonLabel: book.stage === "published" ? "Get the book" : "See the book",
          }}
          squareImagePath={`${path}/square`}
        />
      )}
      {previewing && <PreviewBar backHref={path} />}

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-[15rem_1fr]">
          <div className="aspect-[2/3] w-60 max-w-full overflow-hidden border border-line bg-paper-deep">
            {book.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.coverUrl} alt={`Cover of ${book.title}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center font-display text-xl text-muted">
                {book.title}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-ui text-xs uppercase tracking-wide text-accent">{stageLine}</p>
            <h1 className="font-display mt-2 text-4xl leading-tight">{book.title}</h1>
            {book.tagline && <p className="mt-2 text-lg text-muted">{book.tagline}</p>}
            <p className="font-ui mt-3 text-sm text-muted">
              by{" "}
              <Link href={authorPath(author.handle)} className="text-ink hover:text-accent">
                {author.name}
              </Link>{" "}
              · {book.genre}
            </p>
            {record && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <RecordBadge badge={record.badge} href={`${path}/record`} />
                <Link href={`${path}/record`} className="font-ui text-xs text-accent underline">
                  See how it was written
                </Link>
              </div>
            )}
            <TrustBadges {...trust} className="mt-3" />

            {book.tropes.length > 0 && (
              <ul className="font-ui mt-4 flex flex-wrap gap-2 text-xs">
                {book.tropes.map((t) => (
                  <li key={t} className="border border-line px-2 py-0.5 text-ink">
                    {t}
                  </li>
                ))}
              </ul>
            )}

            <div className="font-ui mt-6 flex flex-wrap gap-3">
              {book.stage === "published" &&
                book.buyLinks.map((l) => (
                  <a
                    key={`${l.label}-${l.url}`}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-accent px-4 py-2 text-sm text-paper hover:bg-accent-soft"
                  >
                    Buy on {l.label}
                  </a>
                ))}
              {!book.published &&
                book.preorderLinks.map((l) => (
                  <a
                    key={`${l.label}-${l.url}`}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-accent px-4 py-2 text-sm text-paper hover:bg-accent-soft"
                  >
                    Preorder on {l.label}
                  </a>
                ))}
              {book.arcOpen && !book.published && (
                <Link href={`/arc/book/${book.id}`} className="bg-ink px-4 py-2 text-sm text-paper">
                  Request an advance copy
                  {book.arcDeadline
                    ? ` · read by ${new Date(book.arcDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
                    : ""}
                </Link>
              )}
              {book.betaOpen && !book.published && (
                <Link href={`/beta/book/${book.id}`} className="border border-ink/30 px-4 py-2 text-sm text-ink">
                  Apply to beta read
                </Link>
              )}
              {(!isOwner || previewing) && (
                <VisitorShareButton path={path} title={`${book.title} by ${author.name}`} />
              )}
            </div>

            {book.blurb && (
              <p className="mt-8 whitespace-pre-wrap text-base leading-relaxed text-ink">{book.blurb}</p>
            )}
          </div>
        </div>

        <section className="mt-12 grid gap-6 border-t border-line pt-8 md:grid-cols-2">
          <div className="flex gap-4">
            {author.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={author.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full border border-line object-cover" />
            )}
            <div className="min-w-0">
              <p className="font-ui text-[10px] uppercase tracking-wide text-muted">About the author</p>
              <Link href={authorPath(author.handle)} className="font-display text-xl hover:text-accent">
                {author.name}
              </Link>
              {author.bio && <p className="mt-1 line-clamp-4 text-sm text-muted">{author.bio}</p>}
              <AuthorLinks links={author.links} className="mt-2" />
            </div>
          </div>
          {studio && (
            <GuestListSignup
              authorUserId={author.userId}
              authorName={author.name}
              heading={book.published ? `More from ${author.name}` : `Get notified when ${book.title} is out`}
            />
          )}
        </section>
      </main>
    </div>
  );
}

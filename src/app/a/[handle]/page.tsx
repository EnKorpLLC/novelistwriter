import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { listLaunchBooks, resolveAuthor, type LaunchBook } from "@/lib/public-site";
import { loadTrustBadges } from "@/lib/trust-badges";
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

export const dynamic = "force-dynamic";

const STAGE_NOTE: Record<LaunchBook["stage"], string> = {
  published: "Out now",
  arc: "Advance copies open",
  beta: "Beta readers wanted",
  coming_soon: "Coming soon",
};

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const author = await resolveAuthor(createServiceClient(), handle);
  if (!author) return { title: "Author not found" };
  const title = `${author.name} — Novelist Writer`;
  const description = author.bio.slice(0, 200) || `Books by ${author.name}.`;
  return { title, description, openGraph: { title, description, type: "profile" }, twitter: { card: "summary_large_image", title, description } };
}

function BookGrid({
  title,
  books,
  handle,
  noAi,
}: {
  title: string;
  books: LaunchBook[];
  handle: string;
  noAi: Set<string>;
}) {
  if (!books.length) return null;
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl">{title}</h2>
      <ul className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
        {books.map((b) => (
          <li key={b.id}>
            <Link href={bookPath(handle, b.slug)} className="group block">
              <div className="aspect-[2/3] overflow-hidden border border-line bg-paper-deep">
                {b.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.coverUrl} alt="" className="h-full w-full object-cover transition group-hover:opacity-90" />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-center font-display text-lg text-muted">
                    {b.title}
                  </div>
                )}
              </div>
              <p className="font-display mt-2 text-lg leading-tight group-hover:text-accent">{b.title}</p>
              <p className="font-ui text-xs text-muted">
                {STAGE_NOTE[b.stage]}
                {noAi.has(b.id) ? " · No AI used" : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function AuthorSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { handle } = await params;
  const { preview } = await searchParams;
  const admin = createServiceClient();
  const author = await resolveAuthor(admin, handle);
  if (!author) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === author.userId;
  const previewing = isOwner && preview === "visitor";

  const [books, studio] = await Promise.all([listLaunchBooks(admin, author.userId), userHasStudio(author.userId)]);
  const { aiOffSince, noAiProjectIds } = await loadTrustBadges(
    admin,
    author.userId,
    books.map((b) => b.id)
  );
  const featured = books.find((b) => b.id === author.featuredProjectId) || null;
  const rest = books.filter((b) => b.id !== featured?.id);
  const path = authorPath(author.handle);

  return (
    <div className="min-h-screen" style={themeStyle(author.theme)}>
      <ShareVisitBeacon />
      <PublicHeader />
      {isOwner && !previewing && (
        <OwnerBar
          label="This is your author site."
          editHref="/dashboard/profile"
          previewHref={`${path}?preview=visitor`}
          sharePath={path}
          title={`${author.name}'s books`}
          posts={[
            { label: "Profile", text: `All my books, beta reads, and advance copies in one place.` },
          ]}
          newsletter={{
            heading: `Find all my books in one place`,
            body: "New releases, beta reads, and advance copies.",
            buttonLabel: "Visit my author page",
          }}
        />
      )}
      {previewing && <PreviewBar backHref={path} />}

      {author.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={author.bannerUrl} alt="" className="h-48 w-full object-cover md:h-64" />
      )}

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-end gap-5">
          {author.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.avatarUrl}
              alt=""
              className={`h-24 w-24 rounded-full border-2 border-paper object-cover ${author.bannerUrl ? "-mt-20" : ""}`}
            />
          )}
          <div className="min-w-0">
            <p className="font-ui text-xs uppercase tracking-wide text-muted">Author</p>
            <h1 className="font-display text-4xl">{author.name}</h1>
          </div>
          {(!isOwner || previewing) && <VisitorShareButton path={path} title={`${author.name}'s books`} />}
        </div>
        <TrustBadges aiOffSince={aiOffSince} className="mt-3" />
        {author.bio && <p className="mt-4 max-w-2xl whitespace-pre-wrap text-ink">{author.bio}</p>}
        <AuthorLinks links={author.links} className="mt-3" />

        {featured && (
          <section className="mt-10 grid gap-6 border border-line p-5 md:grid-cols-[10rem_1fr]">
            <Link href={bookPath(author.handle, featured.slug)} className="block">
              <div className="aspect-[2/3] w-40 max-w-full overflow-hidden border border-line bg-paper-deep">
                {featured.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={featured.coverUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
            </Link>
            <div className="min-w-0">
              <p className="font-ui text-xs uppercase tracking-wide text-accent">
                Featured · {STAGE_NOTE[featured.stage]}
              </p>
              <Link href={bookPath(author.handle, featured.slug)} className="font-display mt-1 block text-3xl hover:text-accent">
                {featured.title}
              </Link>
              {featured.tagline && <p className="mt-1 text-muted">{featured.tagline}</p>}
              {noAiProjectIds.has(featured.id) && <TrustBadges noAiOnBook className="mt-3" />}
              {featured.blurb && <p className="mt-3 line-clamp-5 text-sm text-ink">{featured.blurb}</p>}
              <Link
                href={bookPath(author.handle, featured.slug)}
                className="font-ui mt-4 inline-block bg-accent px-4 py-2 text-sm text-paper"
              >
                See the book
              </Link>
            </div>
          </section>
        )}

        <BookGrid
          title="Looking for beta readers"
          books={rest.filter((b) => b.stage === "beta")}
          handle={author.handle}
          noAi={noAiProjectIds}
        />
        <BookGrid
          title="Advance reader copies"
          books={rest.filter((b) => b.stage === "arc")}
          handle={author.handle}
          noAi={noAiProjectIds}
        />
        <BookGrid
          title="Coming soon"
          books={rest.filter((b) => b.stage === "coming_soon")}
          handle={author.handle}
          noAi={noAiProjectIds}
        />
        <BookGrid
          title="Published books"
          books={rest.filter((b) => b.stage === "published")}
          handle={author.handle}
          noAi={noAiProjectIds}
        />
        {!books.length && <p className="font-ui mt-10 text-sm text-muted">No public books yet.</p>}

        {studio && (
          <div className="mt-12 max-w-xl">
            <GuestListSignup authorUserId={author.userId} authorName={author.name} />
          </div>
        )}
      </main>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { listPublishedBooks } from "@/lib/public-books";
import { normalizePublicLinks, publicLinkList } from "@/lib/public-profile";
import { userHasStudio } from "@/lib/credits";
import { isArcWindowOpen } from "@/lib/arc";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { PublicHeader } from "@/components/PublicHeader";
import { AuthorLinks } from "@/components/AuthorConnect";

export const dynamic = "force-dynamic";

type OpenBook = { id: string; title: string; coverUrl: string | null; href: string; note: string };

function BookRow({ title, books }: { title: string; books: OpenBook[] }) {
  if (!books.length) return null;
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl">{title}</h2>
      <ul className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
        {books.map((b) => (
          <li key={b.id}>
            <Link href={b.href} className="group block">
              <div className="aspect-[2/3] overflow-hidden border border-line bg-paper-deep">
                {b.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-center font-display text-lg text-muted">
                    {b.title}
                  </div>
                )}
              </div>
              <p className="font-display mt-2 text-lg leading-tight group-hover:text-accent">{b.title}</p>
              <p className="font-ui text-xs text-muted">{b.note}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function AuthorPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name, public_links, is_author")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.is_author === false) notFound();

  const studio = await userHasStudio(userId);
  const [published, { data: openRows }] = await Promise.all([
    listPublishedBooks(admin, { authorUserId: userId }),
    studio
      ? admin
          .from("projects")
          .select("id, title, cover_path, metadata, updated_at, beta_ready, arc_open, arc_deadline")
          .eq("user_id", userId)
          .or("beta_ready.eq.true,arc_open.eq.true")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const cover = (p: { cover_path?: string | null; metadata?: Record<string, unknown> | null; updated_at?: string | null }) =>
    coverPublicUrl(projectCoverPath(p), p.updated_at ? Date.parse(p.updated_at) : undefined);

  const betaBooks: OpenBook[] = (openRows || [])
    .filter((p) => p.beta_ready)
    .map((p) => ({
      id: p.id,
      title: p.title,
      coverUrl: cover(p),
      href: `/beta/book/${p.id}`,
      note: "Open for beta readers",
    }));
  const arcBooks: OpenBook[] = (openRows || [])
    .filter((p) => isArcWindowOpen(p))
    .map((p) => ({
      id: p.id,
      title: p.title,
      coverUrl: cover(p),
      href: `/arc/book/${p.id}`,
      note: p.arc_deadline
        ? `ARC · read by ${new Date(p.arc_deadline).toLocaleDateString("en-US", { timeZone: "UTC" })}`
        : "ARC copies available",
    }));
  const publishedBooks: OpenBook[] = published.map((b) => ({
    id: b.id,
    title: b.title,
    coverUrl: b.coverUrl,
    href: `/books/${b.id}`,
    note: b.genre,
  }));

  const name = profile.display_name || "Author";
  const links = publicLinkList(normalizePublicLinks(profile.public_links));

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="font-ui text-xs uppercase tracking-wide text-muted">Author</p>
        <h1 className="font-display mt-1 text-4xl">{name}</h1>
        <AuthorLinks links={links} className="mt-3" />

        <BookRow title="Looking for beta readers" books={betaBooks} />
        <BookRow title="Advance reader copies" books={arcBooks} />
        <BookRow title="Published books" books={publishedBooks} />

        {!betaBooks.length && !arcBooks.length && !publishedBooks.length && (
          <p className="font-ui mt-10 text-sm text-muted">No public books yet.</p>
        )}
      </main>
    </div>
  );
}

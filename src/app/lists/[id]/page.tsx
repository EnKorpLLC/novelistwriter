import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { publicReaderName } from "@/lib/beta-access";
import type { PublishedBook } from "@/lib/public-books";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A public reader list, with only books that are publicly listed. */
async function loadList(id: string) {
  if (!UUID.test(id)) return null;
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const { listPublishedBooks } = await import("@/lib/public-books");
    const admin = createServiceClient();
    const { data: list, error } = await admin.from("reader_lists").select("id, user_id, title, description, public, updated_at").eq("id", id).maybeSingle();
    if (error || !list?.public) return null;
    const [{ data: items }, { data: owner }, catalog] = await Promise.all([
      admin.from("reader_list_items").select("project_id, note, position").eq("list_id", id).order("position"),
      admin.from("profiles").select("handle, display_name, email, reader_profile_public").eq("id", list.user_id).maybeSingle(),
      listPublishedBooks(admin),
    ]);
    const byId = new Map(catalog.map((b) => [b.id, b]));
    return {
      title: list.title as string,
      description: list.description as string,
      updatedAt: list.updated_at as string,
      owner: publicReaderName(owner?.display_name, owner?.email, "A reader"),
      ownerHandle: owner?.reader_profile_public ? (owner.handle as string | null) : null,
      books: (items || []).map((i) => ({ book: byId.get(i.project_id), note: i.note as string })).filter((x): x is { book: PublishedBook; note: string } => Boolean(x.book)),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const list = await loadList(id);
  if (!list) return { title: "List not found" };
  const description = list.description || `${list.books.length} books chosen by ${list.owner} on Novelist Writer.`;
  return { title: `${list.title}, a reader list on Novelist Writer`, description, alternates: { canonical: `/lists/${id}` }, openGraph: { title: list.title, description } };
}

export default async function ReaderListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await loadList(id);
  if (!list) notFound();
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="font-ui text-xs uppercase tracking-wide text-muted">Reader list</p>
        <h1 className="font-display mt-1 text-4xl">{list.title}</h1>
        <p className="font-ui mt-1 text-sm text-muted">
          By{" "}
          {list.ownerHandle ? (
            <Link href={`/r/${list.ownerHandle}`} className="text-accent underline">
              {list.owner}
            </Link>
          ) : (
            list.owner
          )}{" "}
          · {list.books.length} book{list.books.length === 1 ? "" : "s"}
        </p>
        {list.description && <p className="mt-4 whitespace-pre-line">{list.description}</p>}
        {list.books.length === 0 ? (
          <p className="font-ui mt-8 text-sm text-muted">No books on this list yet.</p>
        ) : (
          <ol className="mt-8 space-y-5">
            {list.books.map(({ book, note }, i) => (
              <li key={book.id} className="flex gap-4">
                <span className="font-ui w-6 shrink-0 pt-1 text-sm text-muted">{i + 1}.</span>
                <Link href={book.href} className="shrink-0">
                  {book.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={book.coverUrl} alt="" className="h-28 w-20 border border-line object-cover" />
                  ) : (
                    <div className="h-28 w-20 border border-line bg-paper-deep" />
                  )}
                </Link>
                <div className="min-w-0">
                  <Link href={book.href} className="font-display text-xl hover:text-accent">
                    {book.title}
                  </Link>
                  <p className="font-ui text-xs text-muted">
                    {book.authorName} · {book.genre}
                  </p>
                  {note && <p className="mt-2 text-sm">“{note}”</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="font-ui mt-10 text-sm text-muted">
          Make your own lists from your{" "}
          <Link href="/library" className="text-accent underline">
            library
          </Link>
          .
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getLaunchBook, resolveAuthor } from "@/lib/public-site";
import { computeWritingRecord } from "@/lib/writing-record";
import { trustBadgesForBook } from "@/lib/trust-badges";
import { bookPath } from "@/lib/handles";
import { themeStyle } from "@/lib/site-themes";
import { PublicHeader } from "@/components/PublicHeader";
import { TrustBadges } from "@/components/TrustBadges";
import { RecordBadge, WritingRecordView } from "@/components/WritingRecordView";

export const dynamic = "force-dynamic";

type Params = { handle: string; slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { handle, slug } = await params;
  const admin = createServiceClient();
  const author = await resolveAuthor(admin, handle);
  const book = author ? await getLaunchBook(admin, author.userId, slug) : null;
  if (!author || !book) return { title: "Writing record not found" };
  return {
    title: `How ${book.title} was written`,
    description: `The writing record for ${book.title} by ${author.name}: sessions, dates, and typed vs pasted text.`,
  };
}

export default async function WritingRecordPage({ params }: { params: Promise<Params> }) {
  const { handle, slug } = await params;
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
  const { data: flags } = await admin.from("projects").select("record_public").eq("id", book.id).maybeSingle();
  const isPublic = Boolean(flags?.record_public);
  if (!isPublic && !isOwner) notFound();

  const [record, trust] = await Promise.all([
    computeWritingRecord(admin, book.id),
    trustBadgesForBook(admin, author.userId, book.id),
  ]);
  const path = bookPath(author.handle, book.slug);

  return (
    <div className="min-h-screen" style={themeStyle(author.theme)}>
      <PublicHeader />
      {isOwner && !isPublic && (
        <div className="font-ui border-b border-line bg-paper-deep/60 px-6 py-2 text-xs md:px-10">
          <div className="mx-auto max-w-3xl">
            Only you can see this. Publish it from the book&apos;s{" "}
            <Link href={`/project/${book.id}?tab=publish`} className="text-accent underline">
              Launch tab
            </Link>
            .
          </div>
        </div>
      )}
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href={path} className="font-ui text-xs text-accent underline">
          ← {book.title}
        </Link>
        <p className="font-ui mt-6 text-xs uppercase tracking-wide text-muted">Writing record</p>
        <h1 className="font-display mt-1 text-3xl">How {book.title} was written</h1>
        <p className="font-ui mt-1 text-sm text-muted">by {author.name}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RecordBadge badge={record.badge} />
          <TrustBadges noAiOnBook={trust.noAiOnBook} aiActions={trust.aiActions} />
        </div>
        <div className="mt-8">
          <WritingRecordView record={record} showNeeded={isOwner} />
        </div>
      </main>
    </div>
  );
}

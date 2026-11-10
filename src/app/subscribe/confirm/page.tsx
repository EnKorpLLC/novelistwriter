import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/admin";
import { PublicHeader } from "@/components/PublicHeader";
import { authorPath } from "@/lib/handles";
import { deliverPendingMagnets } from "@/lib/direct-sales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your subscription — Novelist Writer" };

export default async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const admin = createServiceClient();
  let authorName: string | null = null;
  let handle: string | null = null;
  let freeBooks: string[] = [];

  if (token && /^[0-9a-f]{48}$/.test(token)) {
    const { data: row } = await admin
      .from("author_subscribers")
      .select("id, author_user_id, sources, email")
      .eq("confirm_token", token)
      .maybeSingle();
    if (row) {
      const now = new Date().toISOString();
      const sources: string[] = Array.isArray(row.sources) ? row.sources : [];
      await admin
        .from("author_subscribers")
        .update({
          confirmed_at: now,
          confirm_token: null,
          unsubscribed_at: null,
          subscribed_at: now,
          sources: sources.includes("opt_in") ? sources : [...sources, "opt_in"],
          updated_at: now,
        })
        .eq("id", row.id);
      const { data: author } = await admin
        .from("profiles")
        .select("display_name, handle")
        .eq("id", row.author_user_id)
        .maybeSingle();
      authorName = author?.display_name || "the author";
      handle = author?.handle || null;
      // Free books they asked for when joining (reader magnets)
      freeBooks = row.email ? await deliverPendingMagnets(admin, row.author_user_id, row.email).catch(() => []) : [];
    }
  }

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="font-ui mx-auto max-w-lg px-6 py-16">
        {authorName ? (
          <>
            <h1 className="font-display text-3xl">You&apos;re on the list</h1>
            <p className="mt-3 text-sm text-muted">
              You&apos;ll hear from {authorName} about new books, advance copies, and release news.
            </p>
            {freeBooks.length > 0 && (
              <div className="mt-6 border border-accent p-4">
                <p className="text-sm text-ink">Your free {freeBooks.length === 1 ? "book is" : "books are"} ready. We&apos;ve emailed the link too.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {freeBooks.map((url, i) => (
                    <Link key={url} href={url} className="bg-accent px-4 py-2 text-sm text-paper">
                      {freeBooks.length === 1 ? "Get your ebook" : `Get ebook ${i + 1}`}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {handle && (
              <Link href={authorPath(handle)} className="mt-6 inline-block text-sm text-accent underline">
                Visit {authorName}&apos;s page
              </Link>
            )}
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl">That link didn&apos;t work</h1>
            <p className="mt-3 text-sm text-muted">
              It may have been used already or replaced by a newer email. Sign up again from the
              author&apos;s page to get a fresh link.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

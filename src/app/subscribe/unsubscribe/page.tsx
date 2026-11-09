import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { createServiceClient } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "@/lib/email-queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe — Novelist Writer", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ a?: string; e?: string; t?: string; done?: string }> }) {
  const { a = "", e = "", t = "", done } = await searchParams;
  const valid = Boolean(a && e && verifyUnsubscribe(a, e, t));
  const { data: author } = valid ? await createServiceClient().from("profiles").select("display_name").eq("id", a).maybeSingle() : { data: null };
  const name = author?.display_name || "this author";

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="font-ui mx-auto max-w-lg px-6 py-16">
        {done ? (
          <>
            <h1 className="font-display text-3xl">You&apos;re unsubscribed</h1>
            <p className="mt-3 text-muted">You won&apos;t get more emails from that author&apos;s list. Join again anytime from their page.</p>
          </>
        ) : valid ? (
          <form method="post" action="/api/audience/unsubscribe">
            <h1 className="font-display text-3xl">Unsubscribe from {name}?</h1>
            <p className="mt-3 text-muted">
              {e} will stop getting release news and updates from {name}. Other authors you follow aren&apos;t affected.
            </p>
            <input type="hidden" name="a" value={a} />
            <input type="hidden" name="e" value={e} />
            <input type="hidden" name="t" value={t} />
            <button type="submit" className="mt-6 bg-accent px-5 py-2.5 text-paper">
              Unsubscribe
            </button>
          </form>
        ) : (
          <>
            <h1 className="font-display text-3xl">This link isn&apos;t valid</h1>
            <p className="mt-3 text-muted">
              Use the unsubscribe link from the email itself, or{" "}
              <Link href="/contact" className="text-accent underline">
                contact us
              </Link>{" "}
              and we&apos;ll take care of it.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

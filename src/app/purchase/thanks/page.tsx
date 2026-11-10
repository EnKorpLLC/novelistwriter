import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thank you | Novelist Writer", robots: { index: false, follow: false } };

/** Where Stripe sends the buyer after paying. The sale is recorded by the webhook, usually within seconds. */
export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ session_id?: string; n?: string }> }) {
  const { session_id: sessionId, n } = await searchParams;
  const tries = Number(n) || 0;
  if (sessionId && /^cs_[\w]+$/.test(sessionId)) {
    try {
      const { createServiceClient } = await import("@/lib/supabase/admin");
      const { data } = await createServiceClient().from("book_purchases").select("download_token").eq("stripe_session_id", sessionId).maybeSingle();
      if (data?.download_token) redirect(`/purchase/${data.download_token}`);
    } catch (e) {
      // redirect() works by throwing; let it through
      if (e && typeof e === "object" && "digest" in e) throw e;
    }
  }
  const waiting = Boolean(sessionId) && tries < 6;
  return (
    <div className="min-h-screen">
      {waiting && <meta httpEquiv="refresh" content={`3;url=/purchase/thanks?session_id=${sessionId}&n=${tries + 1}`} />}
      <PublicHeader />
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="font-display text-3xl">Thank you!</h1>
        <p className="font-ui mt-3 text-sm text-muted">
          {waiting
            ? "Your payment went through. We're getting your ebook ready…"
            : "Your payment went through. Your receipt email has the download link, and it'll arrive within a few minutes."}
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thank you | Novelist Writer", robots: { index: false, follow: false } };

/**
 * Where Stripe sends the buyer after paying. The webhook usually records the sale within seconds; if it hasn't by
 * the third look, the order is recorded from here (the same safe-to-repeat step), so a slow or failing webhook
 * never leaves a paid order unrecorded.
 */
export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ session_id?: string; n?: string }> }) {
  const { session_id: sessionId, n } = await searchParams;
  const tries = Number(n) || 0;
  let format = "";
  let problem: string | null = null;
  if (sessionId && /^cs_[\w]+$/.test(sessionId)) {
    try {
      const { createServiceClient } = await import("@/lib/supabase/admin");
      const admin = createServiceClient();
      const find = () => admin.from("book_purchases").select("download_token").eq("stripe_session_id", sessionId).maybeSingle();
      let { data } = await find();
      if (!data?.download_token && tries >= 2) {
        const { getStripe } = await import("@/lib/stripe");
        const session = await getStripe().checkout.sessions.retrieve(sessionId);
        format = String(session.metadata?.format || "");
        if (session.metadata?.kind === "book_purchase" && session.payment_status === "paid") {
          if (format === "paperback") await (await import("@/lib/print-sales")).recordPaperbackPurchase(admin, sessionId);
          else if (format === "item") await (await import("@/lib/shop")).recordItemPurchase(admin, sessionId);
          else await (await import("@/lib/direct-sales")).recordBookPurchase(admin, sessionId);
          ({ data } = await find());
        }
      }
      if (data?.download_token) redirect(`/purchase/${data.download_token}`);
    } catch (e) {
      // redirect() works by throwing; let it through
      if (e && typeof e === "object" && "digest" in e) throw e;
      problem = e instanceof Error ? e.message : "Your order couldn't be recorded.";
      console.error("thanks page: purchase not recorded", sessionId, e);
    }
  }
  const waiting = Boolean(sessionId) && tries < 6 && !problem;
  const printed = format === "paperback" || format === "item";
  return (
    <div className="min-h-screen">
      {waiting && <meta httpEquiv="refresh" content={`3;url=/purchase/thanks?session_id=${sessionId}&n=${tries + 1}`} />}
      <PublicHeader />
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="font-display text-3xl">Thank you!</h1>
        <p className="font-ui mt-3 text-sm text-muted">
          {problem
            ? "Your payment went through, but we couldn't record your order yet. It's kept safe and we'll finish it shortly; you'll get your receipt email then."
            : waiting
              ? printed
                ? "Your payment went through. We're recording your order…"
                : "Your payment went through. We're getting your book ready…"
              : "Your payment went through. Your receipt email has a link to your order, and it'll arrive within a few minutes."}
        </p>
        {problem && <p className="font-ui mt-4 border border-line px-3 py-2 text-left text-xs text-muted">Details for support: {problem}</p>}
      </main>
      <PublicFooter />
    </div>
  );
}

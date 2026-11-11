import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { MarketWaitlist } from "@/components/MarketWaitlist";
import { contentMetadata } from "@/lib/seo";
import { NARRATION_FEE_PCT } from "@/lib/narration";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { typeStatuses } from "@/lib/marketplace";
import { MARKET_TYPES } from "@/lib/market-types";

export const dynamic = "force-dynamic";

export const metadata = contentMetadata({
  title: "Hire an editor, cover designer, or narrator",
  description:
    "Hire human editors, proofreaders, cover designers, illustrators, map makers, and narrators for your book. One fee shown on every quote, payments held until delivery, and no AI-made work.",
  path: "/hire",
  kicker: "Hire help",
});

/** The marketplace for authors: each type of pro opens once enough founding pros have joined. */
export default async function HirePage() {
  const user = await createClient()
    .then((s) => s.auth.getUser())
    .then((r) => r.data.user)
    .catch(() => null);
  const statuses = await Promise.resolve()
    .then(() => typeStatuses(createServiceClient()))
    .catch(() => null);
  const byId = new Map((statuses || []).map((s) => [s.id, s]));
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Hire help</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Human editors, artists, and narrators for your book</h1>
        <p className="mt-4 text-lg text-muted">
          One {NARRATION_FEE_PCT}% fee, paid by you and shown on the quote before you agree. You pay each milestone as it starts, and we hold it until you
          approve the work. Every pro promises their work is human-made.
        </p>
        <p className="font-ui mt-3 text-sm text-muted">
          We&apos;re gathering founding pros now. Each kind opens once five have joined, so you&apos;ll have real choice on day one. Tell us what you need and
          we&apos;ll email you the day it opens.
        </p>
        <ul className="font-ui mt-10 divide-y divide-line border-y border-line">
          {MARKET_TYPES.map((t) => {
            const s = byId.get(t.id);
            return (
              <li key={t.id} id={t.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-display text-xl text-ink">{t.plural}</p>
                  <p className="text-xs text-muted">{t.blurb}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {s?.state === "open" ? "Open" : s?.state === "ready" ? "Opening soon" : "Coming soon"}
                    {s && s.approved > 0 && s.state !== "open" ? ` · ${s.approved} founding ${s.approved === 1 ? "pro" : "pros"} so far` : ""}
                  </p>
                </div>
                <div className="shrink-0">
                  <MarketWaitlist type={t.id} label={t.plural} signedIn={Boolean(user?.email)} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="font-ui mt-6 text-sm text-muted">
          Already working with someone? Narrators can be invited from your book&apos;s Audio tab today. Are you an editor or artist?{" "}
          <Link href="/pros" className="text-accent underline">
            Join as a founding pro
          </Link>
          .
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";
import { NARRATION_FEE_PCT } from "@/lib/narration";
import { createServiceClient } from "@/lib/supabase/admin";
import { typeStatuses } from "@/lib/marketplace";
import { MARKET_TYPES, type MarketTypeStatus } from "@/lib/market-types";

export const revalidate = 300;

export const metadata = contentMetadata({
  title: "For editors, artists, and narrators",
  description:
    "Join Novelist Writer's marketplace as a founding editor, proofreader, cover designer, illustrator, map maker, or narrator. You keep your full price, payments are held until delivery, and every pro's work is human-made.",
  path: "/pros",
  kicker: "For editors and artists",
});

const POINTS: { t: string; d: string }[] = [
  { t: "Keep your full price", d: `One ${NARRATION_FEE_PCT}% fee, paid by the author and shown on every quote. Nothing comes out of what you charge, and listing costs nothing.` },
  { t: "Paid for every milestone", d: "Authors pay each milestone when it starts, and we hold it until they approve your delivery. An author who goes quiet for 14 days counts as approval." },
  { t: "Clear scopes", d: "Every job has a written scope, deliverables, and the revision rounds included. Extra work needs a new quote." },
  {
    t: "Work the way you already do",
    d: "Editors download the manuscript in Word, edit with Track Changes, and deliver the file; the author goes through your changes one by one in the app. Artists deliver files with their process, and the author can make your cover their book's cover in one click.",
  },
  { t: "Reviews that mean something", d: "Only authors who completed a paid job with you can review you, and you can reply once." },
  { t: "Human-made, on purpose", d: "Authors here prove they wrote their books. Every pro promises their work is human-made too, which is the reason authors will come to you." },
];

/** Recruiting page: each type opens to authors once enough founding pros have joined. */
export default async function ProsPage() {
  // The build has no database keys; the page fills in on its next refresh
  const statuses = await Promise.resolve()
    .then(() => typeStatuses(createServiceClient()))
    .catch(() => null);
  const byId = new Map((statuses || []).map((s) => [s.id, s]));
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">For editors, artists, and narrators</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Be one of the first pros authors can hire here</h1>
        <p className="mt-4 text-lg text-muted">
          We&apos;re opening a marketplace for human editors, artists, and narrators. Each kind opens to authors once five founding pros have joined, so the
          first authors find real choice. Founding pros get a badge and the top spots.
        </p>
        <div className="font-ui mt-6 flex flex-wrap gap-3">
          <Link href="/pros/join" className="bg-accent px-5 py-2.5 text-sm text-paper">
            Apply as a founding pro
          </Link>
          <Link href="/hire" className="border border-line px-5 py-2.5 text-sm">
            I&apos;m an author looking to hire
          </Link>
        </div>

        <section className="mt-12">
          <h2 className="font-display text-2xl">Where each one stands</h2>
          <ul className="font-ui mt-4 divide-y divide-line border-y border-line text-sm">
            {MARKET_TYPES.map((t) => (
              <TypeRow key={t.id} label={t.plural} blurb={t.blurb} status={byId.get(t.id) || null} />
            ))}
          </ul>
        </section>

        <ul className="mt-12 space-y-8">
          {POINTS.map((p) => (
            <li key={p.t} className="border-t border-line pt-4">
              <h2 className="font-display text-2xl">{p.t}</h2>
              <p className="mt-3 text-muted">{p.d}</p>
            </li>
          ))}
        </ul>
        <section className="font-ui mt-12 border border-accent p-5 text-sm">
          <p className="text-ink">
            Applying takes about ten minutes: what you do, a short bio, your rates, and a few portfolio pieces. We review every profile by hand. Already narrate
            for an author here? You can list yourself from your narrator dashboard.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/pros/join" className="bg-accent px-4 py-2 text-paper">
              Apply
            </Link>
            <Link href="/narrators" className="border border-line px-4 py-2">
              For narrators
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function TypeRow({ label, blurb, status }: { label: string; blurb: string; status: MarketTypeStatus | null }) {
  const approved = status?.approved ?? 0;
  const threshold = status?.threshold ?? 5;
  const pct = Math.min(100, Math.round((approved / Math.max(1, threshold)) * 100));
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-lg text-ink">{label}</span>
        <span className="text-xs text-muted">
          {status?.state === "open"
            ? "Open to authors"
            : status?.state === "ready"
              ? "Ready: opening soon"
              : `${Math.min(approved, threshold)} of ${threshold} founding pros`}
          {status && status.waiting > 0 ? ` · ${status.waiting} ${status.waiting === 1 ? "author" : "authors"} waiting` : ""}
        </span>
      </div>
      <p className="text-xs text-muted">{blurb}</p>
      <div className="mt-2 h-1.5 w-full bg-line" aria-hidden>
        <div className="h-1.5 bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

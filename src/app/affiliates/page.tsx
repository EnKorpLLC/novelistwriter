import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "Affiliate program: earn 30% for a year",
  description:
    "Recommend Novelist Writer to writers and earn 30% of what they pay for Pro or Studio in their first 12 months, paid monthly to your bank through Stripe.",
  path: "/affiliates",
  kicker: "Affiliate program",
});

const RULES = [
  "Say you're an affiliate wherever you share your link, in plain words like “I earn a commission if you sign up.” It's the law (the FTC's endorsement rules) and it keeps trust.",
  "No self-referrals, no paying people to sign up, and no fake or duplicate accounts.",
  "Don't bid on “Novelist Writer” or misspellings of it in search ads, and don't pose as us.",
  "No spam: no unsolicited email or direct messages, and no posting your link where the community's rules don't allow it.",
  "No coupon or deal sites; we don't run a discount for affiliate links.",
  "Tell the truth about what Novelist Writer does. In particular, don't say it writes books with AI. It doesn't: AI only critiques, never writes.",
];

export default function AffiliatesPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Affiliate program</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Earn 30% for a year</h1>
        <p className="mt-4 text-lg text-muted">
          Writing coaches, editors, BookTubers, podcasters, and authors with writer audiences: recommend Novelist Writer, and
          earn 30% of what each writer you refer pays for Pro or Studio in their first 12 months.
        </p>

        <section className="font-ui mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { big: "30%", small: "of subscription payments for each writer's first 12 months" },
            { big: "$176", small: "a year from one Studio writer; $68 from one on Pro" },
            { big: "Monthly", small: "payouts to your bank through Stripe once you're owed $25" },
          ].map((s) => (
            <div key={s.big} className="border border-line p-4">
              <div className="font-display text-3xl text-ink">{s.big}</div>
              <div className="mt-1 text-sm text-muted">{s.small}</div>
            </div>
          ))}
        </section>

        <h2 className="font-display mt-12 text-2xl">How it works</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted">
          <li>Apply with a Novelist Writer account and tell us where you&apos;ll share it. We review every application by hand.</li>
          <li>Once you&apos;re approved, share your link. Anyone who signs up within 30 days of clicking it is yours.</li>
          <li>When they pay for Pro or Studio, you earn 30% of each payment (before sales tax) for 12 months from their first payment.</li>
          <li>Each commission is held 60 days so refunds and chargebacks can settle. Refunded payments don&apos;t earn commission.</li>
          <li>On the 1st of each month, everything that&apos;s cleared goes to your bank through Stripe, once it adds up to $25.</li>
        </ol>
        <p className="mt-4 text-sm text-muted">
          Payouts are handled by Stripe, which verifies your identity and bank details. You can be paid in the US, Canada, the
          UK, Australia, New Zealand, much of Europe, and Singapore. US affiliates paid $2,000 or more in a year get a 1099
          form from Stripe. Commissions are for subscriptions; credit packs and book unlocks don&apos;t count.
        </p>

        <h2 className="font-display mt-12 text-2xl">The rules</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Breaking these can mean commissions are reversed and the account is closed. We can change the program with 30
          days&apos; notice; commissions already earned are always paid under the terms they were earned under.
        </p>

        <div className="font-ui mt-12 flex flex-wrap gap-3">
          <Link href="/dashboard/affiliate" className="bg-accent px-5 py-2.5 text-paper">
            Apply now
          </Link>
          <Link href="/pricing" className="border border-line px-5 py-2.5 text-ink hover:border-accent">
            See what writers pay
          </Link>
        </div>
        <p className="font-ui mt-6 text-xs text-muted">
          Prefer free Studio time? Anyone can still earn free Studio days by sharing their books and link, with or without
          joining the affiliate program.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

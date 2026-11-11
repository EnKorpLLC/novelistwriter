import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";
import { PAYOUT_MIN_CENTS, PREORDER_GRACE_DAYS, REFUND_WINDOW_DAYS, SALE_FEES, dollars } from "@/lib/direct-sale-rules";

export const metadata = contentMetadata({
  title: "Seller terms",
  description: "How selling your ebook direct on Novelist Writer works: fees, sales tax, refunds, and payouts.",
  path: "/seller-terms",
  kicker: "For authors",
});

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function SellerTermsPage() {
  const terms = [
    {
      t: "Who sells",
      d: "Novelist Writer sells your ebook to the reader for you and delivers the file. You keep the rights to your book. You can stop selling anytime, and readers who already bought it can still download their copies.",
    },
    {
      t: "What you allow us to do",
      d: "Sell and deliver the book you've turned on for sale, at the price you set, and show its cover, title, and description on your pages and in the catalog.",
    },
    {
      t: "Fees",
      d: `On Pro, ${pct(SALE_FEES.pro.pct)} + ${SALE_FEES.pro.fixedCents}¢ per sale. On Studio, ${pct(SALE_FEES.studio.pct)} + ${SALE_FEES.studio.fixedCents}¢. Stripe's card processing (about 2.9% + 30¢) also comes out of each sale. Each book's Sell tab shows what you keep at your price.`,
    },
    {
      t: "Sales tax",
      d: "We collect and pay sales tax where it's owed, added on top of your price at checkout, so it never comes out of your share. You're responsible for income tax on your earnings; Stripe sends you a tax form (1099) when required.",
    },
    {
      t: "Refunds",
      d: `Readers can get a full refund within ${REFUND_WINDOW_DAYS} days. When that happens our fee is given back to you, but Stripe keeps its processing fee, so that comes out of your share as it would on a sale. Chargebacks work the same way.`,
    },
    {
      t: "Payouts",
      d: `Each sale is held for ${REFUND_WINDOW_DAYS} days (the refund window), then added to your balance. We pay out monthly through Stripe once your balance reaches ${dollars(PAYOUT_MIN_CENTS)}. Smaller balances roll over and never expire.`,
    },
    {
      t: "Pre-orders",
      d: `If you take pre-orders, readers pay at order and get the ebook when you mark the book out now. They can cancel anytime before release. If you move the date later, they're told and can keep or cancel, and anyone still waiting ${PREORDER_GRACE_DAYS} days after their promised date is refunded automatically. A cancelled pre-order is refunded like any other (Stripe's fee comes out of your share). Pre-order money is paid out after delivery, once the ${REFUND_WINDOW_DAYS}-day refund window passes.`,
    },
    {
      t: "Your book and extras",
      d: "Only sell books and extras you have the right to sell. Art someone else made for your book often only covers using it in and around the book; selling it as an extra needs their permission. Anything that breaks our conduct rules or someone else's rights can be taken down, and its sales refunded. Readers keep extras they've bought, or got with the ebook, even if you turn them off later.",
    },
    {
      t: "Changes",
      d: "We'll give you at least 30 days' notice before changing fees, and changes never apply to sales already made.",
    },
  ];
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">For authors</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Seller terms</h1>
        <p className="mt-4 text-lg text-muted">Selling your ebook direct is part of Pro and Studio. Here&apos;s how it works, in plain words.</p>
        <ul className="mt-10 space-y-6">
          {terms.map((i) => (
            <li key={i.t} className="border-t border-line pt-4">
              <h2 className="font-display text-xl">{i.t}</h2>
              <p className="mt-1 text-muted">{i.d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-muted">
          See also the reader{" "}
          <Link href="/refunds" className="text-accent underline">
            refund policy
          </Link>{" "}
          and{" "}
          <Link href="/conduct" className="text-accent underline">
            conduct rules
          </Link>
          .
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

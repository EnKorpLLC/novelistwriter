import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "Refunds and your books",
  description: "Ebooks bought on Novelist Writer are yours to keep and download anytime. Changed your mind? Ask for a refund within 14 days.",
  path: "/refunds",
  kicker: "For readers",
});

const ITEMS = [
  { t: "Yours to keep", d: "An ebook you buy here never expires. Download it again anytime from your library or the link in your receipt. There's no copy protection: the file just notes whose copy it is." },
  { t: "Prices in dollars", d: "No coins, credits, or subscriptions to read a book you bought. Sales tax is shown at checkout before you pay, where it applies." },
  { t: "Refunds within 14 days", d: "Changed your mind, or the file didn't work for you? Reply to your receipt email within 14 days of buying and we'll refund you in full. After a refund, the download stops working." },
  {
    t: "Pre-orders",
    d: "You pay when you pre-order, and the ebook arrives in your library the day the book comes out. Cancel anytime before then from your pre-order page for a full refund. If the author moves the date, we tell you and you can keep it or cancel. If it's ever more than 30 days late, we refund you automatically. The 14 days for a refund start when your ebook arrives.",
  },
  { t: "Extras", d: "Art, maps, and bonus stories you buy or get with an ebook are yours to download and keep, the same as your books." },
  {
    t: "Paperbacks",
    d: "Paperbacks are printed for you when you order, so you can cancel within an hour of ordering (before printing starts) for a full refund, but they can't be returned after that. If yours arrives misprinted or damaged, or never arrives, reply to your receipt email with a photo within 30 days and we'll replace it.",
  },
  { t: "No ads, ever", d: "We don't show ads to readers, and we don't sell your data. The author sees that a copy sold, not who bought it." },
];

export default function RefundsPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">For readers</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Refunds and your books</h1>
        <ul className="mt-10 space-y-6">
          {ITEMS.map((i) => (
            <li key={i.t} className="border-t border-line pt-4">
              <h2 className="font-display text-xl">{i.t}</h2>
              <p className="mt-1 text-muted">{i.d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-muted">
          Something else?{" "}
          <Link href="/contact" className="text-accent underline">
            Contact us
          </Link>
          .
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

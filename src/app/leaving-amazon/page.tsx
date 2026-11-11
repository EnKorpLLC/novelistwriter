import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "Thinking about leaving Amazon?",
  description:
    "What changed at Kindle and Audible in late 2026, what it means for indie authors and narrators, and the options for selling wide or direct. Factual and dated, with sources.",
  path: "/leaving-amazon",
  kicker: "Your options",
});

const UPDATED = "November 10, 2026";

const CHANGES: { t: string; d: string; src: { label: string; href: string } }[] = [
  {
    t: "Kindle Unlimited became Kindle+, with audiobooks, paid from the same pool",
    d: "On October 22, 2026, Amazon renamed Kindle Unlimited to Kindle+ and added audiobooks. A reader who reads your book and also listens to it pays you once, from the same page-read pool, and Amazon hasn't said how much extra money it's adding to that pool.",
    src: { label: "KDP Help", href: "https://kdp.amazon.com/en_US/help/topic/GK7RD8FBE99TS34X" },
  },
  {
    t: "AI narration went in automatically; much human narration didn't",
    d: "Amazon's \u201cVirtual Voice\u201d AI audiobooks were added to Kindle+ without authors opting in. Human-narrated ACX titles only qualify if they're exclusive, have Whispersync turned on, and the narrator was paid a flat fee, which leaves out Royalty Share narrators.",
    src: { label: "Voice Over Herald", href: "https://www.voiceoverherald.com/kindle-plus-audiobooks-virtual-voice-acx-royalty-share-narrators/" },
  },
  {
    t: "Audible moves every title to pooled royalties",
    d: "Audible ends its old royalty model on December 31, 2026. Each listener's monthly payment is split across everything they listened to, so heavy listeners spread it thin. A petition against the change passed 30,000 signatures.",
    src: { label: "Author Media", href: "https://www.authormedia.com/audible-forces-every-title-into-new-royalty-model/" },
  },
];

export default function LeavingAmazonPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Your options · updated {UPDATED}</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Thinking about leaving Amazon?</h1>
        <p className="mt-4 text-lg text-muted">
          Amazon is still the biggest bookstore, and for many authors it should stay part of the plan. But a lot changed this fall. Here&apos;s what, in plain terms, and what you can do
          about it, whether you leave, go wide, or just stop depending on one pool.
        </p>

        <h2 className="font-display mt-12 text-3xl">What changed</h2>
        <ul className="mt-4 space-y-6">
          {CHANGES.map((c) => (
            <li key={c.t} className="border-t border-line pt-4">
              <h3 className="font-display text-xl">{c.t}</h3>
              <p className="mt-2 text-muted">{c.d}</p>
              <a href={c.src.href} target="_blank" rel="noopener noreferrer" className="font-ui mt-1 inline-block text-xs text-accent underline">
                Source: {c.src.label}
              </a>
            </li>
          ))}
        </ul>

        <h2 className="font-display mt-12 text-3xl">Before you decide</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
          <li>
            Ebooks in KDP Select (Kindle+) must be exclusive to Amazon, so you can&apos;t sell them anywhere else, including direct from your own page, while they&apos;re enrolled. Enrollment
            runs in 90-day terms; you can turn off auto-renew and leave at the end of the current one.
          </li>
          <li>ACX audiobooks distributed exclusively are tied to Audible for the term of that agreement. Check your ACX dashboard for the dates before planning anything else.</li>
          <li>Paperbacks aren&apos;t affected by Select exclusivity; they can be sold anywhere already.</li>
        </ul>

        <h2 className="font-display mt-12 text-3xl">Your options here</h2>
        <ul className="mt-4 space-y-5">
          <li className="border-t border-line pt-4">
            <h3 className="font-display text-xl">Sell direct, and get paid per sale</h3>
            <p className="mt-2 text-muted">
              Readers buy the ebook, the audiobook, or both right from your launch page and keep them. You keep about 78% on Pro or 83% on Studio of each sale, we handle sales tax, and
              there&apos;s no page-read pool.{" "}
              <Link href="/pricing" className="text-accent underline">
                See the numbers
              </Link>
            </p>
          </li>
          <li className="border-t border-line pt-4">
            <h3 className="font-display text-xl">Go wide</h3>
            <p className="mt-2 text-muted">
              A separate ebook for each store (Kindle, Apple Books, Kobo, Google Play, Barnes &amp; Noble), each linking to that store, plus print-ready paperbacks for KDP Print and
              IngramSpark. Nothing here is exclusive.{" "}
              <Link href="/works-with" className="text-accent underline">
                Works with
              </Link>
            </p>
          </li>
          <li className="border-t border-line pt-4">
            <h3 className="font-display text-xl">Make a human-narrated audiobook you control</h3>
            <p className="mt-2 text-muted">
              Record it yourself or hire a narrator with a fair agreement, then export files mastered to ACX&apos;s specs that work at ACX, Spotify for Authors, Google Play, Kobo, and here.
              The narrator is paid on time, and every copy sold here is a real sale.{" "}
              <Link href="/narrators" className="text-accent underline">
                For narrators
              </Link>
            </p>
          </li>
          <li className="border-t border-line pt-4">
            <h3 className="font-display text-xl">Own your readers</h3>
            <p className="mt-2 text-muted">
              Your launch page collects readers&apos; emails for you, and you can export them any time. If a store changes its rules again, you can still reach the people who read you.
            </p>
          </li>
        </ul>

        <p className="mt-12 text-sm text-muted">
          We&apos;ll keep this page current as things change, and correct it if anything here turns out wrong.{" "}
          <Link href="/contact" className="text-accent underline">
            Tell us
          </Link>{" "}
          if you spot something.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { SUB_ALLOWANCE } from "@/lib/types";

export const metadata = {
  title: "For authors — Novelist Writer",
  description:
    "Write your novel, prove you wrote it, and take it from first draft through beta readers and ARCs to launch. Free to start; Pro and Studio when you're ready.",
};

const PLANS = [
  {
    name: "Free",
    price: "$0",
    note: "forever",
    lead: "Everything you need to write and launch one book.",
    items: [
      "Full writing studio: chapters, scene notes, focus mode, find and replace",
      "Story bible for characters, places, lore, and timeline",
      "1 project (add more for $9 each, one time)",
      "Writing record and badges that show you wrote it",
      "One switch to turn every AI tool off",
      "DOCX and EPUB export, front and back matter, KDP readiness checklist",
      "Launch page for your book and your own author site",
      "AI critique pay as you go, with credit packs from $5",
    ],
  },
  {
    name: "Pro",
    price: "$16",
    note: "per month",
    lead: "For writers with more than one book on the go.",
    items: [
      "Everything in Free",
      "Unlimited projects",
      `${SUB_ALLOWANCE.pro} AI critique credits every month for line edits, developmental notes, continuity, plotholes, pacing, and more`,
    ],
  },
  {
    name: "Studio",
    price: "$32",
    note: "per month",
    lead: "Run beta readers, ARCs, and your audience from one place.",
    highlight: true,
    items: [
      "Everything in Pro",
      "Beta reader desk: application forms, auto-approve rules, chapter progress, DNF reasons, comments pinned to the sentence",
      "ARC desk: read-by deadlines, reminders, mailing addresses, one-tap review links",
      "Audience lists across all your books, guest email signups, CSV export",
      "Your books listed in the reader catalog",
      "Series tools",
      `${SUB_ALLOWANCE.studio} AI credits every month, bring your own API key, priority AI`,
    ],
  },
];

export default function AuthorsPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main>
        <section className="hero-wash border-b border-line px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">For authors</p>
            <h1 className="font-display mt-4 text-5xl leading-tight text-ink md:text-6xl">
              Write it yourself.
              <br />
              Prove it. Launch it.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted">
              One studio from first draft to release day: a record of how you wrote it, beta readers
              and ARCs that live where your book does, and a launch page you can share anywhere. AI
              critiques and never writes, and it turns off with one switch.
            </p>
            <div className="font-ui mt-10 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-sm bg-ink px-6 py-3 text-paper transition hover:bg-accent">
                Start your first book free
              </Link>
              <Link
                href="/pricing"
                className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent"
              >
                Full pricing
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20 md:px-10">
          <h2 className="font-display text-3xl text-ink">Pick what fits</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.name} className={`flex flex-col border p-6 ${p.highlight ? "border-accent" : "border-line"}`}>
                <h3 className="font-display text-2xl">{p.name}</h3>
                <p className="mt-1 text-3xl text-ink">
                  {p.price}
                  <span className="font-ui text-sm text-muted"> {p.note}</span>
                </p>
                <p className="font-ui mt-2 text-sm text-muted">{p.lead}</p>
                <ul className="font-ui mt-4 flex-1 space-y-2 text-sm text-ink">
                  {p.items.map((i) => (
                    <li key={i} className="border-t border-line pt-2">
                      {i}
                    </li>
                  ))}
                </ul>
                <Link
                  href={p.name === "Free" ? "/signup" : "/billing"}
                  className={`font-ui mt-6 inline-block px-4 py-2 text-center text-sm ${
                    p.highlight ? "bg-accent text-paper" : "border border-line text-accent"
                  }`}
                >
                  {p.name === "Free" ? "Start free" : `Get ${p.name}`}
                </Link>
              </div>
            ))}
          </div>
          <p className="font-ui mt-4 text-xs text-muted">Pro and Studio can be billed monthly or yearly. Cancel anytime.</p>
        </section>

        <section className="border-y border-line bg-paper-deep/40 px-6 py-16 md:px-10">
          <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl">Earn Studio for free</h2>
              <p className="mt-3 text-sm text-muted">
                Every link you share carries your name. When people visit, readers join your beta or
                ARC, or a writer you invited gets going, you earn free days of Studio&apos;s reader
                tools (AI credits not included). Bank up to four weeks and start them when your next
                book is ready.
              </p>
            </div>
            <div>
              <h2 className="font-display text-2xl">On every plan</h2>
              <ul className="font-ui mt-3 space-y-1.5 text-sm text-muted">
                <li>Your book stays yours: we never train on your manuscript</li>
                <li>Export anytime; nothing is held hostage</li>
                <li>Writing records and AI-off badges</li>
                <li>Launch page and author site</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16 text-center md:px-10">
          <h2 className="font-display text-3xl">Your first book is free</h2>
          <div className="font-ui mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="bg-accent px-6 py-3 text-paper">
              Start writing
            </Link>
            <Link href="/readers" className="border border-line px-6 py-3 text-accent">
              What readers get
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

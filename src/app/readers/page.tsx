import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { ShareVisitBeacon } from "@/components/ShareVisitBeacon";

export const metadata = {
  alternates: { canonical: "/readers" },
  title: "For readers — Novelist Writer",
  description:
    "Read books before anyone else, free. Beta read and get advance copies from indie authors, comment right on the page, and follow the writers you love.",
};

const FEATURES = [
  {
    t: "Read before anyone else",
    d: "Browse books open for beta readers and advance reader copies (ARCs) by genre. Read the blurb or a sample chapter, then apply or request a copy.",
  },
  {
    t: "Read right in your browser",
    d: "No files to download. Your place is saved, so you pick up where you left off on any device.",
  },
  {
    t: "Comment on the exact sentence",
    d: "Highlight a passage and tell the author what you felt, or leave notes for a whole chapter. Authors see your notes right beside the chapter as they revise, and can react and reply.",
  },
  {
    t: "Finish, or say why you stopped",
    d: "Leave a short review when you finish a beta read, or mark it DNF with a reason. Both help the author more than you'd think.",
  },
  {
    t: "ARC reviews in one tap",
    d: "When you finish an advance copy, you get a button for each store the author picked, plus Copy review so you can paste what you wrote.",
  },
  {
    t: "Physical copies and thank-you gifts",
    d: "Some authors ask ARC readers for a mailing address to send a print copy or a small thank-you. Only that author ever sees it.",
  },
  {
    t: "Follow authors you love",
    d: "Get a notification (and an email, if you want one) when they open a new beta read or ARC, and join their email list in one click.",
  },
  {
    t: "Know how a book was written",
    d: "Before you apply, listings can show badges like “No AI used on this book” or “Written in Novelist Writer,” and a writing record summary, when the author chooses to share them.",
  },
  {
    t: "Clear dates, fair time",
    d: "Every beta read shows when it ends, and you get 3 extra days after that to send your final review. Advance copies show their read-by date.",
  },
  {
    t: "Earn reader badges",
    d: "Finisher, On time, Thoughtful feedback, Reviewer, and Top rated. Authors see your badges when you apply, so a good track record gets you picked.",
  },
  {
    t: "A public reader profile, if you want one",
    d: "Turn it on to share a page with your badges and reading stats. It never lists the books you read or anything you wrote in them.",
  },
];

export default function ReadersPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <ShareVisitBeacon />
      <main>
        <section className="hero-wash border-b border-line px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">For readers</p>
            <h1 className="font-display mt-4 text-5xl leading-tight text-ink md:text-6xl">
              Read books before
              <br />
              anyone else. Free.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted">
              Beta read and get advance copies from indie authors, tell them what worked right on the
              page, and follow the writers you love. A reader account costs nothing, ever.
            </p>
            <div className="font-ui mt-10 flex flex-wrap gap-3">
              <Link href="/beta/signup" className="rounded-sm bg-ink px-6 py-3 text-paper transition hover:bg-accent">
                Create a free reader account
              </Link>
              <Link
                href="/beta/dashboard?tab=catalog"
                className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent"
              >
                Browse open books
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20 md:px-10">
          <h2 className="font-display text-3xl text-ink">What you can do</h2>
          <ul className="mt-10 grid gap-8 md:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.t} className="border-t border-line pt-4">
                <h3 className="font-display text-xl">{f.t}</h3>
                <p className="mt-2 text-sm text-muted">{f.d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-y border-line bg-paper-deep/40 px-6 py-16 md:px-10">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-3xl">What it costs</h2>
            <p className="mt-3 max-w-2xl text-muted">
              Nothing. Reader accounts are free, beta reads and advance copies are free, and there are
              no ads. Authors pay for the tools that run their reading programs, so readers never do.
            </p>
            <p className="mt-3 max-w-2xl text-sm text-muted">
              Also a writer? It&apos;s the same login. Switch between your reader and author dashboards
              anytime.
            </p>
            <div className="font-ui mt-6 flex flex-wrap gap-3 text-sm">
              <Link href="/beta/signup" className="bg-accent px-4 py-2 text-paper">
                Start reading
              </Link>
              <Link href="/books" className="border border-line px-4 py-2 text-accent">
                See published books
              </Link>
              <Link href="/authors" className="self-center text-accent underline">
                I&apos;m a writer
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

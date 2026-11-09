import Link from "next/link";
import { JOB_META } from "@/lib/ai/jobs";
import { ShareVisitBeacon } from "@/components/ShareVisitBeacon";
import { JsonLd } from "@/components/JsonLd";
import { organizationJsonLd, softwareJsonLd, websiteJsonLd } from "@/lib/seo";
import { LaunchingThisWeek } from "@/components/LaunchingThisWeek";
import { launchingThisWeek } from "@/lib/spotlight";
import { createServiceClient } from "@/lib/supabase/admin";

export const metadata = { alternates: { canonical: "/" } };
// Rebuilt hourly so "Launching this week" stays current
export const revalidate = 3600;

async function spotlight() {
  try {
    return await launchingThisWeek(createServiceClient(), 4);
  } catch {
    // No database access while building locally
    return [];
  }
}

const AI_ACTIONS = Object.values(JOB_META);

const PROOF_POINTS = [
  {
    t: "Typed here, not pasted",
    d: "The editor keeps a private count of what you typed, what you pasted, and what you imported. Never your words, just the process of how they got there.",
  },
  {
    t: "Every session, every day",
    d: "Months of writing sessions and revisions add up to a history nobody can fake in an afternoon.",
  },
  {
    t: "Early writers aren't penalized",
    d: "Anything written before records began is marked “Before records” and never counts against you.",
  },
  {
    t: "Badges readers can trust",
    d: "Books with no AI run on them show “No AI used on this book.” Turn AI off entirely and your page says so. You choose whether badges and your writing record show on your Beta and ARC listings.",
  },
];

const DESK_POINTS = [
  {
    t: "Beta readers, run like a desk",
    d: "Application forms, auto-approve rules, an end date readers can see (plus 3 days to send final reviews), progress by chapter, DNF reasons, and comments pinned to the exact sentence.",
  },
  {
    t: "ARC copies with a deadline",
    d: "Send advance copies, set a read-by date, send reminders before it, and close the manuscript when it passes.",
  },
  {
    t: "Feedback where you write",
    d: "Each chapter's reader comments sit right beside the text as you revise. Resolve and reply without leaving the page, or export everything as a Word document.",
  },
  {
    t: "See where readers stop",
    d: "Reader insights chart who joined when, how far each reader got, how often they come back, and the chapter where most of them drop off.",
  },
  {
    t: "Pick readers with a track record",
    d: "Every applicant shows their badges: Finisher, On time, Thoughtful feedback, Reviewer, and Top rated, plus ratings from other authors.",
  },
  {
    t: "Reviews in one tap",
    d: "When ARC readers finish, they get a button per store plus Copy review, and mark where they posted.",
  },
  {
    t: "An audience you keep",
    d: "Every beta and ARC reader joins one list across all your books, with CSV export for your newsletter tool.",
  },
];

const FORMAT_POINTS = [
  {
    t: "8 book styles",
    d: "Classic, literary, romance, thriller, fantasy, cozy, modern, and YA, each with matched fonts, drop caps or small caps, chapter openings, and scene-break ornaments.",
  },
  {
    t: "Pages built for you",
    d: "Fill in your book details once to get a title page, a copyright page with your ISBN, contents, an also-by page that links your other books, and a review request.",
  },
  {
    t: "Smart chapters",
    d: "Prologues, epilogues, and part pages are spotted for you and numbered the way real books are, in the chapter heading style you choose.",
  },
  {
    t: "Print-ready paperbacks",
    d: "Five trim sizes, large print in one click, running heads, a contents page with real page numbers, and inside margins that grow with your page count the way KDP requires.",
  },
  {
    t: "Checked before you upload",
    d: "A checklist covers page count limits, margins, fonts, and your copyright page, and the page count flows straight into your cover size.",
  },
  {
    t: "A cover builder that fits",
    d: "Design the front, spine, and back on the exact wrap for your page count, with your own art and our fonts. It warns about the safe area and blurry art, then saves your ebook cover and paperback cover PDF.",
  },
];

export default async function HomePage() {
  const launching = await spotlight();
  return (
    <div className="min-h-screen">
      <header className="app-chrome font-ui flex items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className="font-display text-xl tracking-tight text-ink">
          Novelist Writer
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/books" className="text-muted hover:text-ink">
            Published books
          </Link>
          <Link href="/authors" className="text-muted hover:text-ink">
            For authors
          </Link>
          <Link href="/readers" className="text-muted hover:text-ink">
            For readers
          </Link>
          <Link href="/challenges" className="text-muted hover:text-ink">
            Challenges
          </Link>
          <Link href="/pricing" className="text-muted hover:text-ink">
            Pricing
          </Link>
          <Link href="/login" className="text-muted hover:text-ink">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-sm bg-accent px-4 py-2 text-paper transition hover:bg-accent-soft"
          >
            Start writing free
          </Link>
        </nav>
      </header>

      <ShareVisitBeacon />
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(), softwareJsonLd()]} />
      <main>
        <section className="hero-wash relative min-h-[88vh] overflow-hidden border-b border-line">
          <div className="relative z-10 mx-auto flex max-w-5xl flex-col justify-center px-6 pb-24 pt-16 md:px-10 md:pt-24">
            <p className="font-ui animate-fade-up text-xs uppercase tracking-[0.2em] text-accent">
              Novelist Writer
            </p>
            <h1 className="font-display animate-fade-up mt-4 text-5xl leading-[1.05] tracking-tight text-ink md:text-7xl md:leading-[1.02]">
              Write it yourself.
              <br />
              Prove it.
            </h1>
            <p
              className="animate-fade-up mt-6 max-w-2xl text-lg text-muted md:text-xl"
              style={{ animationDelay: "0.15s" }}
            >
              The writing studio that takes your novel from first draft through beta readers, ARCs,
              and a beautifully formatted ebook to launch. AI critiques, never writes, and turns off with one switch.
            </p>
            <div
              className="animate-fade-up mt-10 flex flex-wrap gap-3 font-ui"
              style={{ animationDelay: "0.3s" }}
            >
              <Link
                href="/signup"
                className="rounded-sm bg-ink px-6 py-3 text-paper transition hover:bg-accent"
              >
                Start your first book free
              </Link>
              <Link
                href="/pricing"
                className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent"
              >
                See pricing
              </Link>
              <Link
                href="/readers"
                className="self-center px-2 py-3 text-accent underline-offset-4 hover:underline"
              >
                I&apos;m a reader →
              </Link>
            </div>
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22 viewBox=%220 0 80 80%22%3E%3Cpath fill=%22none%22 stroke=%22%232c5f4a22%22 stroke-width=%221%22 d=%22M0 40h80M40 0v80%22/%3E%3C/svg%3E')] opacity-60 md:block"
            aria-hidden
          />
        </section>

        {launching.length > 0 && (
          <section className="mx-auto max-w-5xl px-6 pt-16 md:px-10">
            <LaunchingThisWeek books={launching} />
          </section>
        )}

        <section id="proof" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-20 md:px-10">
          <p className="font-ui text-[10px] uppercase tracking-wide text-accent">Proof of authorship</p>
          <h2 className="font-display mt-2 text-3xl text-ink">Your writing history is your proof</h2>
          <p className="mt-3 max-w-2xl text-muted">
            Readers are asking whether a person really wrote the book. Novelist Writer keeps a record
            of how yours came together, session by session, from the day you start writing here. On
            Pro and Studio, publish it right next to your book with a &ldquo;Written in Novelist
            Writer&rdquo; badge.
          </p>
          <ul className="mt-10 grid gap-8 md:grid-cols-2">
            {PROOF_POINTS.map((item, i) => (
              <li
                key={item.t}
                className="animate-fade-up border-t border-line pt-4"
                style={{ animationDelay: `${0.08 * i}s` }}
              >
                <h3 className="font-display text-xl">{item.t}</h3>
                <p className="mt-2 text-sm text-muted">{item.d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="ai" className="scroll-mt-24 border-y border-line bg-paper-deep/40 px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <p className="font-ui text-[10px] uppercase tracking-wide text-accent">AI your way</p>
            <h2 className="font-display mt-2 text-3xl text-ink">An editor, never a ghostwriter</h2>
            <p className="mt-3 max-w-2xl text-muted">
              AI here only reports problems and asks questions. Nothing writes your chapters, nothing
              pastes prose into your book, and we never train on your manuscript. Don&apos;t want any of
              it? One switch in Settings turns every AI tool off, and your books show it.
            </p>
            <details className="font-ui mt-8">
              <summary className="cursor-pointer text-sm text-accent">
                See every AI action ({AI_ACTIONS.length})
              </summary>
              <ul className="mt-6 grid gap-6 sm:grid-cols-2">
                {AI_ACTIONS.map((job) => (
                  <li key={job.label} className="border-t border-line pt-3">
                    <h3 className="text-sm font-medium text-ink">{job.label}</h3>
                    <p className="mt-1 text-sm text-muted">{job.description}</p>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>

        <section id="beta" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-20 md:px-10">
          <p className="font-ui text-[10px] uppercase tracking-wide text-accent">Studio</p>
          <h2 className="font-display mt-2 text-3xl text-ink">From draft to launch in one place</h2>
          <p className="mt-3 max-w-2xl text-muted">
            Most writers juggle a word processor, a beta tool, an ARC service, and a spreadsheet of
            readers. Studio puts your beta readers, ARC readers, and the audience they become in the
            same place your book is written.
          </p>
          <ul className="mt-10 grid gap-8 md:grid-cols-2">
            {DESK_POINTS.map((item, i) => (
              <li
                key={item.t}
                className="animate-fade-up border-t border-line pt-4"
                style={{ animationDelay: `${0.08 * i}s` }}
              >
                <h3 className="font-display text-xl">{item.t}</h3>
                <p className="mt-2 text-sm text-muted">{item.d}</p>
              </li>
            ))}
          </ul>
          <div className="font-ui mt-10 flex flex-wrap gap-3">
            <Link
              href="/pricing"
              className="rounded-sm bg-accent px-6 py-3 text-paper transition hover:bg-accent-soft"
            >
              See Studio pricing
            </Link>
            <Link
              href="/signup"
              className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent"
            >
              Start free — upgrade when ready
            </Link>
          </div>
        </section>

        <section id="format" className="scroll-mt-24 border-t border-line px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <p className="font-ui text-[10px] uppercase tracking-wide text-accent">Format · Pro and Studio</p>
            <h2 className="font-display mt-2 text-3xl text-ink">A beautiful ebook and paperback, without another app</h2>
            <p className="mt-3 max-w-2xl text-muted">
              Pick a book style, see your book on Kindle, phone, and tablet screens as you go, and
              download a store-ready EPUB for Kindle, Apple Books, Kobo, and Google Play. Then lay it
              out as printed pages and save a paperback PDF ready for KDP, design a cover that fits
              your exact spine, and turn it into a 3D book and ready-sized ads. Studio adds an ebook
              for each store and box sets. No Vellum, no Mac, no extra license.
            </p>
            <ul className="mt-10 grid gap-8 md:grid-cols-3">
              {FORMAT_POINTS.map((item) => (
                <li key={item.t} className="border-t border-line pt-4">
                  <h3 className="font-display text-xl">{item.t}</h3>
                  <p className="mt-2 text-sm text-muted">{item.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="launch" className="scroll-mt-24 border-t border-line bg-paper-deep/30 px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <p className="font-ui text-[10px] uppercase tracking-wide text-accent">Launch · Pro and Studio</p>
            <h2 className="font-display mt-2 text-3xl text-ink">A launch page and an author site, built in</h2>
            <p className="mt-3 max-w-2xl text-muted">
              On Pro, every book gets a page that grows with it: cover reveal and preorders, then buy
              buttons on release day, with beta and ARC calls on Studio. Your author site gathers every
              book, your bio, and your links at one short address you can put anywhere.
            </p>
            <ul className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                {
                  t: "Made to be shared",
                  d: "Copy-ready posts for every network, a block for your newsletter, and a square image for Instagram.",
                },
                {
                  t: "Readers join your list",
                  d: "Visitors sign up on your page and confirm by email, so your list stays real.",
                },
                {
                  t: "Proof travels with it",
                  d: "Badges like “No AI used on this book” show wherever your book does, including link previews.",
                },
              ].map((item) => (
                <li key={item.t} className="border-t border-line pt-4">
                  <h3 className="font-display text-xl">{item.t}</h3>
                  <p className="mt-2 text-sm text-muted">{item.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="launch-engine" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-20 md:px-10">
          <p className="font-ui text-[10px] uppercase tracking-wide text-accent">Studio</p>
          <h2 className="font-display mt-2 text-3xl text-ink">Launch without crickets</h2>
          <p className="mt-3 max-w-2xl text-muted">
            Launching a book is the scariest part. Studio walks you through it, gets reviews in on day one, and sends
            Novelist Writer&apos;s readers to your launch.
          </p>
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              { t: "A plan that counts down", d: "From cover reveal to reviews, every step has a date, a one-click action, and a post you can edit. A readiness score shows what's left." },
              { t: "Launch day in one click", d: "Readers who asked to hear get an email, followers are told, and every ARC reader is asked to post their review today." },
              { t: "Readers come to you", d: "Your book shows in “Launching this week”, readers can try a sample chapter, and a launch team shares, reviews, and asks their library." },
              { t: "Watch it happen", d: "A launch week dashboard shows visitors, buy clicks by store, new signups, and reviews as they arrive." },
              { t: "Readers feel the thanks", d: "ARC readers get a copy for any e-reader, and you thank them in one click. Authors who do earn a “Thanks readers” label." },
              { t: "Gentle on your inbox", d: "Launch email goes out in batches that stay inside Gmail's daily limit, with an unsubscribe link on every list email." },
              { t: "Posts from your own book", d: "Quote cards in your book's fonts, ARC review cards, and verified writing progress, on a posting calendar that reminds you. Never written by AI." },
            ].map((item) => (
              <li key={item.t} className="border-t border-line pt-4">
                <h3 className="font-display text-xl">{item.t}</h3>
                <p className="mt-2 text-sm text-muted">{item.d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="challenges" className="border-t border-line px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <p className="font-ui text-[10px] uppercase tracking-wide text-accent">Challenges · Free</p>
            <h2 className="font-display mt-2 text-3xl text-ink">Writing challenges where every word is real</h2>
            <p className="mt-3 max-w-2xl text-muted">
              Join a challenge or start one with your writing group, on any dates. Words are counted from your writing record,
              so only what you type counts. No pasted chapters, no padded totals, and a winner badge that means something.
            </p>
            <ul className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                { t: "Verified word counts", d: "Each day counts what your books grew by, never more than you typed. Pasted, imported, and deleted text never counts." },
                { t: "Streaks and leaderboards", d: "Keep a daily streak, climb the leaderboard, and share progress cards as you go." },
                { t: "Badges that travel", d: "Finish a challenge to earn a winner badge, shown on your author site on Pro." },
              ].map((item) => (
                <li key={item.t} className="border-t border-line pt-4">
                  <h3 className="font-display text-xl">{item.t}</h3>
                  <p className="mt-2 text-sm text-muted">{item.d}</p>
                </li>
              ))}
            </ul>
            <Link
              href="/challenges"
              className="font-ui mt-8 inline-block rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent"
            >
              See the challenges
            </Link>
          </div>
        </section>

        <section id="earn" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-20 md:px-10">
          <p className="font-ui text-[10px] uppercase tracking-wide text-accent">Share &amp; earn</p>
          <h2 className="font-display mt-2 text-3xl text-ink">Bring readers, earn Studio for free</h2>
          <p className="mt-3 max-w-2xl text-muted">
            Every link you share carries your name. When people visit, readers join your beta or ARC,
            or a writer you invited gets going, you earn free days of Studio&apos;s beta desk, ARC desk,
            and audience lists. Bank up to four weeks and start them when your next book is ready.
          </p>
          <Link
            href="/signup"
            className="font-ui mt-8 inline-block rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent"
          >
            Start writing free
          </Link>
        </section>

        <section id="readers" className="scroll-mt-24 border-t border-line bg-paper-deep/30 px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <p className="font-ui text-[10px] uppercase tracking-wide text-accent">For readers</p>
            <h2 className="font-display mt-2 text-3xl text-ink">Read books before anyone else. Free.</h2>
            <p className="mt-3 max-w-2xl text-muted">
              Beta read and get advance copies from indie authors, right in your browser. No ads, no
              fees, ever.
            </p>
            <ul className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                {
                  t: "Know how it was written",
                  d: "Listings can show “No AI used on this book” and a writing record, so you see how a book came together before you apply.",
                },
                {
                  t: "Your feedback, on the page",
                  d: "Highlight a sentence and tell the author what you felt. Clear end dates and read-by dates, with time to send your final review.",
                },
                {
                  t: "Badges authors notice",
                  d: "Finish books, leave thoughtful feedback, and post ARC reviews to earn badges that authors see when you apply.",
                },
              ].map((item) => (
                <li key={item.t} className="border-t border-line pt-4">
                  <h3 className="font-display text-xl">{item.t}</h3>
                  <p className="mt-2 text-sm text-muted">{item.d}</p>
                </li>
              ))}
            </ul>
            <div className="font-ui mt-10 flex flex-wrap gap-3">
              <Link
                href="/beta/signup"
                className="rounded-sm bg-accent px-6 py-3 text-paper transition hover:bg-accent-soft"
              >
                Create a free reader account
              </Link>
              <Link
                href="/readers"
                className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent"
              >
                What readers get
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-paper-deep/50 px-6 py-16 md:px-10">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-3xl">Your book stays yours</h2>
            <p className="mt-3 max-w-2xl text-muted">
              We never train on your manuscript. Export is never held hostage. Write free forever;
              pay only for extra projects or AI runs, or subscribe if you prefer.
            </p>
            <Link
              href="/privacy"
              className="font-ui mt-6 inline-block text-accent underline-offset-4 hover:underline"
            >
              Read our privacy promise →
            </Link>
          </div>
        </section>
      </main>

      <footer className="font-ui px-6 py-10 text-sm text-muted md:px-10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <span className="font-display text-ink">Novelist Writer</span>
          <nav className="flex flex-wrap gap-4">
            <Link href="/books" className="hover:text-ink">
              Published books
            </Link>
            <Link href="/authors" className="hover:text-ink">
              For authors
            </Link>
            <Link href="/readers" className="hover:text-ink">
              For readers
            </Link>
            <Link href="/challenges" className="hover:text-ink">
              Challenges
            </Link>
            <Link href="/tools" className="hover:text-ink">
              Free tools
            </Link>
            <Link href="/compare" className="hover:text-ink">
              Compare
            </Link>
            <Link href="/your-data" className="hover:text-ink">
              Your data
            </Link>
            <Link href="/pricing" className="hover:text-ink">
              Pricing
            </Link>
            <Link href="/contact" className="hover:text-ink">
              Contact
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

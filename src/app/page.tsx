import Link from "next/link";
import { JOB_META } from "@/lib/ai/jobs";

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
    d: "Books with no AI run on them show “No AI used on this book.” Turn AI off entirely and your page says so.",
  },
];

const DESK_POINTS = [
  {
    t: "Beta readers, run like a desk",
    d: "Application forms, auto-approve rules, progress by chapter, DNF reasons, and comments pinned to the exact sentence.",
  },
  {
    t: "ARC copies with a deadline",
    d: "Send advance copies, set a read-by date, nudge readers before it, and close the manuscript when it passes.",
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

export default function HomePage() {
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
              The writing studio that takes your novel from first draft through beta readers and ARCs
              to launch. AI critiques, never writes, and turns off with one switch.
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
            </div>
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22 viewBox=%220 0 80 80%22%3E%3Cpath fill=%22none%22 stroke=%22%232c5f4a22%22 stroke-width=%221%22 d=%22M0 40h80M40 0v80%22/%3E%3C/svg%3E')] opacity-60 md:block"
            aria-hidden
          />
        </section>

        <section id="proof" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-20 md:px-10">
          <p className="font-ui text-[10px] uppercase tracking-wide text-accent">Proof of authorship</p>
          <h2 className="font-display mt-2 text-3xl text-ink">Your writing history is your proof</h2>
          <p className="mt-3 max-w-2xl text-muted">
            Readers are asking whether a person really wrote the book. Novelist Writer keeps a record
            of how yours came together, session by session, from the day you start writing here, and
            you can publish it right next to your book with a &ldquo;Written in Novelist Writer&rdquo;
            badge.
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

        <section id="launch" className="scroll-mt-24 border-t border-line bg-paper-deep/30 px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <p className="font-ui text-[10px] uppercase tracking-wide text-accent">Launch</p>
            <h2 className="font-display mt-2 text-3xl text-ink">A launch page and an author site, built in</h2>
            <p className="mt-3 max-w-2xl text-muted">
              Every book gets a page that grows with it: cover reveal and preorders, then beta and ARC
              calls, then buy buttons on release day. Your author site gathers every book, your bio,
              and your links at one short address you can put anywhere.
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

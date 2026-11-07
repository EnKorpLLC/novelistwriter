import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { ShareVisitBeacon } from "@/components/ShareVisitBeacon";
import { PlanCards } from "@/components/PlanCards";

export const metadata = {
  alternates: { canonical: "/authors" },
  title: "For authors — Novelist Writer",
  description:
    "Write your novel, prove you wrote it, and take it from first draft through beta readers and ARCs to launch. Free to start; Pro and Studio when you're ready.",
};

export default function AuthorsPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <ShareVisitBeacon />
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
              and ARCs that live where your book does, their feedback right beside each chapter as you
              revise, and, from Pro up, polished ebook and paperback formatting plus an author site and launch pages
              you can share anywhere. AI
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
          <div className="mt-10">
            <PlanCards />
          </div>
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
                <li>Export your manuscript anytime; it&apos;s never held hostage</li>
                <li>A private record of how you wrote every book</li>
                <li>Public pages (Pro and up) show up in AI search answers, with AI training blocked on them</li>
                <li>One switch to turn every AI tool off</li>
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

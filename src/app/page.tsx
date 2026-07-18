import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="app-chrome font-ui flex items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className="font-display text-xl tracking-tight text-ink">
          Novelist Writer
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/privacy" className="text-muted hover:text-ink">
            Privacy
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
            <p className="font-display animate-fade-up text-5xl leading-[1.05] tracking-tight text-ink md:text-7xl md:leading-[1.02]">
              Novelist Writer
            </p>
            <h1 className="font-display animate-fade-up mt-6 max-w-2xl text-2xl font-medium text-ink/90 md:text-3xl" style={{ animationDelay: "0.1s" }}>
              Write the book. AI stress-tests the craft.
            </h1>
            <p className="animate-fade-up mt-5 max-w-xl text-lg text-muted" style={{ animationDelay: "0.2s" }}>
              Coherence, voice, arcs, and KDP readiness — without writing a word of your novel.
            </p>
            <div className="animate-fade-up mt-10 flex flex-wrap gap-3 font-ui" style={{ animationDelay: "0.3s" }}>
              <Link
                href="/signup"
                className="rounded-sm bg-ink px-6 py-3 text-paper transition hover:bg-accent"
              >
                Start your first project free
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

        <section className="mx-auto max-w-5xl px-6 py-20 md:px-10">
          <h2 className="font-display text-3xl text-ink">AI as editor — never ghostwriter</h2>
          <p className="mt-3 max-w-2xl text-muted">
            Every AI surface asks one question: does this help you revise your own work, or replace it?
            If it replaces it, it does not ship.
          </p>
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              {
                t: "Line & developmental critique",
                d: "Grammar, clarity, and honest craft notes — sidebar only, no Accept-to-insert prose.",
              },
              {
                t: "Story intelligence",
                d: "Continuity, plotholes, arcs, promises, voice comps, and pacing heatmaps.",
              },
              {
                t: "KDP-ready export",
                d: "DOCX and EPUB with front, middle, and back matter templates.",
              },
            ].map((item, i) => (
              <li
                key={item.t}
                className="animate-fade-up border-t border-line pt-4"
                style={{ animationDelay: `${0.1 * i}s` }}
              >
                <h3 className="font-display text-xl">{item.t}</h3>
                <p className="mt-2 text-sm text-muted">{item.d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-y border-line bg-paper-deep/50 px-6 py-16 md:px-10">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-3xl">We never train on your book</h2>
            <p className="mt-3 max-w-2xl text-muted">
              Your manuscript stays yours. Export is never held hostage. Free forever to write —
              pay only for extra projects or AI runs, or subscribe if you prefer.
            </p>
            <Link href="/privacy" className="font-ui mt-6 inline-block text-accent underline-offset-4 hover:underline">
              Read our privacy promise →
            </Link>
          </div>
        </section>
      </main>

      <footer className="font-ui px-6 py-10 text-sm text-muted md:px-10">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-4">
          <span className="font-display text-ink">Novelist Writer</span>
          <span>novelistwriter.com</span>
        </div>
      </footer>
    </div>
  );
}

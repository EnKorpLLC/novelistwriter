import Link from "next/link";
import { JOB_META } from "@/lib/ai/jobs";
import { ShareVisitBeacon } from "@/components/ShareVisitBeacon";
import { JsonLd } from "@/components/JsonLd";
import { InlineText, Lines } from "@/components/Markdown";
import { organizationJsonLd, softwareJsonLd, websiteJsonLd } from "@/lib/seo";
import { LaunchingThisWeek } from "@/components/LaunchingThisWeek";
import { launchingThisWeek } from "@/lib/spotlight";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteText } from "@/lib/site-text";
import type { Point, TextBlock } from "@/lib/site-text-registry";

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

function SectionHead({ block }: { block: TextBlock }) {
  return (
    <>
      {block.kicker && <p className="font-ui text-[10px] uppercase tracking-wide text-accent">{block.kicker}</p>}
      <h2 className="font-display mt-2 text-3xl text-ink">
        <Lines text={block.heading || ""} />
      </h2>
      {block.intro && (
        <p className="mt-3 max-w-2xl text-muted">
          <InlineText text={block.intro} />
        </p>
      )}
    </>
  );
}

function Points({ items, cols = 2, animate = false }: { items?: Point[]; cols?: 2 | 3; animate?: boolean }) {
  if (!items?.length) return null;
  return (
    <ul className={`mt-10 grid gap-8 ${cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
      {items.map((item, i) => (
        <li key={`${item.t}-${i}`} className={`${animate ? "animate-fade-up " : ""}border-t border-line pt-4`} style={animate ? { animationDelay: `${0.08 * i}s` } : undefined}>
          <h3 className="font-display text-xl">{item.t}</h3>
          <p className="mt-2 text-sm text-muted">
            <InlineText text={item.d} />
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function HomePage() {
  const [launching, hero, proof, ai, studio, format, launch, engine, sell, audio, hire, challenges, earn, readers, yours] = await Promise.all([
    spotlight(),
    siteText("home.hero"),
    siteText("home.proof"),
    siteText("home.ai"),
    siteText("home.studio"),
    siteText("home.format"),
    siteText("home.launch"),
    siteText("home.launch_engine"),
    siteText("home.sell"),
    siteText("home.audio"),
    siteText("home.hire"),
    siteText("home.challenges"),
    siteText("home.earn"),
    siteText("home.readers"),
    siteText("home.yours"),
  ]);
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
          <Link href="/signup" className="rounded-sm bg-accent px-4 py-2 text-paper transition hover:bg-accent-soft">
            Start writing free
          </Link>
        </nav>
      </header>

      <ShareVisitBeacon />
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(), softwareJsonLd()]} />
      <main>
        <section className="hero-wash relative min-h-[88vh] overflow-hidden border-b border-line">
          <div className="relative z-10 mx-auto flex max-w-5xl flex-col justify-center px-6 pb-24 pt-16 md:px-10 md:pt-24">
            {hero.kicker && <p className="font-ui animate-fade-up text-xs uppercase tracking-[0.2em] text-accent">{hero.kicker}</p>}
            <h1 className="font-display animate-fade-up mt-4 text-5xl leading-[1.05] tracking-tight text-ink md:text-7xl md:leading-[1.02]">
              <Lines text={hero.heading || ""} />
            </h1>
            {hero.intro && (
              <p className="animate-fade-up mt-6 max-w-2xl text-lg text-muted md:text-xl" style={{ animationDelay: "0.15s" }}>
                <InlineText text={hero.intro} />
              </p>
            )}
            <div className="animate-fade-up mt-10 flex flex-wrap gap-3 font-ui" style={{ animationDelay: "0.3s" }}>
              <Link href="/signup" className="rounded-sm bg-ink px-6 py-3 text-paper transition hover:bg-accent">
                Start your first book free
              </Link>
              <Link href="/pricing" className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent">
                See pricing
              </Link>
              <Link href="/readers" className="self-center px-2 py-3 text-accent underline-offset-4 hover:underline">
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
          <SectionHead block={proof} />
          <Points items={proof.items} animate />
          <Link href="/human-authorship-standard" className="font-ui mt-8 inline-block text-sm text-accent underline-offset-4 hover:underline">
            How we verify →
          </Link>
        </section>

        <section id="ai" className="scroll-mt-24 border-y border-line bg-paper-deep/40 px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <SectionHead block={ai} />
            <details className="font-ui mt-8">
              <summary className="cursor-pointer text-sm text-accent">See every AI action ({AI_ACTIONS.length})</summary>
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
          <SectionHead block={studio} />
          <Points items={studio.items} animate />
          <div className="font-ui mt-10 flex flex-wrap gap-3">
            <Link href="/pricing" className="rounded-sm bg-accent px-6 py-3 text-paper transition hover:bg-accent-soft">
              See Studio pricing
            </Link>
            <Link href="/signup" className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent">
              Start free — upgrade when ready
            </Link>
          </div>
        </section>

        <section id="format" className="scroll-mt-24 border-t border-line px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <SectionHead block={format} />
            <Points items={format.items} cols={3} />
          </div>
        </section>

        <section id="launch" className="scroll-mt-24 border-t border-line bg-paper-deep/30 px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <SectionHead block={launch} />
            <Points items={launch.items} cols={3} />
          </div>
        </section>

        <section id="launch-engine" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-20 md:px-10">
          <SectionHead block={engine} />
          <Points items={engine.items} cols={3} />
        </section>

        <section id="sell" className="scroll-mt-24 border-t border-line bg-paper-deep/30 px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <SectionHead block={sell} />
            <Points items={sell.items} cols={3} />
          </div>
        </section>

        <section id="audiobooks" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-20 md:px-10">
          <SectionHead block={audio} />
          <Points items={audio.items} />
        </section>

        <section id="hire" className="scroll-mt-24 border-t border-line px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <SectionHead block={hire} />
            <Points items={hire.items} />
            <div className="font-ui mt-10 flex flex-wrap gap-3">
              <Link href="/hire" className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent">
                Hire help
              </Link>
              <Link href="/pros" className="self-center px-2 py-3 text-accent underline-offset-4 hover:underline">
                I&apos;m an editor or artist →
              </Link>
            </div>
          </div>
        </section>

        <section id="challenges" className="border-t border-line px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <SectionHead block={challenges} />
            <Points items={challenges.items} cols={3} />
            <Link href="/challenges" className="font-ui mt-8 inline-block rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent">
              See the challenges
            </Link>
          </div>
        </section>

        <section id="earn" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-20 md:px-10">
          <SectionHead block={earn} />
          <Link href="/signup" className="font-ui mt-8 inline-block rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent">
            Start writing free
          </Link>
        </section>

        <section id="readers" className="scroll-mt-24 border-t border-line bg-paper-deep/30 px-6 py-20 md:px-10">
          <div className="mx-auto max-w-5xl">
            <SectionHead block={readers} />
            <Points items={readers.items} cols={3} />
            <div className="font-ui mt-10 flex flex-wrap gap-3">
              <Link href="/beta/signup" className="rounded-sm bg-accent px-6 py-3 text-paper transition hover:bg-accent-soft">
                Create a free reader account
              </Link>
              <Link href="/readers" className="rounded-sm border border-ink/20 px-6 py-3 text-ink transition hover:border-accent hover:text-accent">
                What readers get
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-paper-deep/50 px-6 py-16 md:px-10">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-3xl">
              <Lines text={yours.heading || ""} />
            </h2>
            {yours.intro && (
              <p className="mt-3 max-w-2xl text-muted">
                <InlineText text={yours.intro} />
              </p>
            )}
            <Link href="/privacy" className="font-ui mt-6 inline-block text-accent underline-offset-4 hover:underline">
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
            <Link href="/hire" className="hover:text-ink">
              Hire help
            </Link>
            <Link href="/narrators" className="hover:text-ink">
              For narrators
            </Link>
            <Link href="/tools" className="hover:text-ink">
              Free tools
            </Link>
            <Link href="/guides" className="hover:text-ink">
              Guides
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
            <Link href="/help" className="hover:text-ink">
              Help
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

import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { HelpCenter, type HelpEntry } from "@/components/HelpCenter";
import { contentMetadata } from "@/lib/seo";
import { HELP_ARTICLES, HELP_AUDIENCES } from "@/lib/help";
import { siteHelp } from "@/lib/site-text";

export const metadata = contentMetadata({
  title: "Help center",
  description: "How every part of Novelist Writer works, step by step: for authors, readers, narrators, and editors and artists.",
  path: "/help",
  kicker: "Help",
});

const plain = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

export default async function HelpPage() {
  const articles = await Promise.all(HELP_ARTICLES.map(siteHelp));
  const entries: HelpEntry[] = articles.map((a) => ({
    slug: a.slug,
    audience: a.audience,
    topic: a.topic,
    title: a.title,
    summary: plain(a.summary),
    plan: a.plan,
    text: plain([...a.steps, ...(a.tips || []).map((t) => `${t.t} ${t.d}`), ...(a.faq || []).map((f) => `${f.q} ${f.a}`)].join(" ")),
  }));
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Help</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">How can we help?</h1>
        <p className="mt-4 text-lg text-muted">
          Step-by-step help for every part of Novelist Writer. New here? Start with{" "}
          <Link href="/help/getting-started-authors" className="text-accent underline">
            getting started as an author
          </Link>{" "}
          or{" "}
          <Link href="/help/getting-started-readers" className="text-accent underline">
            as a reader
          </Link>
          .
        </p>
        <HelpCenter entries={entries} audiences={HELP_AUDIENCES} />
        <p className="mt-16 border-t border-line pt-6 text-muted">
          Can&apos;t find it?{" "}
          <Link href="/contact" className="text-accent underline">
            Contact us
          </Link>{" "}
          and a person will answer.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

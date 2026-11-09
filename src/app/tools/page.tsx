import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "Free tools for self-publishing authors",
  description: "A KDP spine width and cover size calculator, novel word counts by genre, a trim size guide, and a writing pace calculator. Free, no sign-up.",
  path: "/tools",
  kicker: "Free author tools",
});

const TOOLS = [
  { href: "/tools/spine-calculator", title: "Spine width and cover size calculator", d: "The exact paperback cover size for KDP or IngramSpark from your page count, trim, and paper." },
  { href: "/tools/novel-word-count", title: "How long is a novel in my genre?", d: "Typical word counts for romance, fantasy, thrillers, YA, and more, with page estimates." },
  { href: "/tools/trim-sizes", title: "Trim size guide", d: "Which paperback size fits your genre, and what it does to your page count." },
  { href: "/tools/writing-pace", title: "Writing pace calculator", d: "How many words a day you need to finish by your date, or when you'll finish at your pace." },
];

export default function ToolsPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Free tools</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Free tools for self-publishing authors</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">No sign-up, no email. Use them as often as you like.</p>
        <ul className="mt-10 grid gap-6 md:grid-cols-2">
          {TOOLS.map((t) => (
            <li key={t.href} className="border border-line p-5">
              <Link href={t.href} className="font-display text-xl hover:text-accent">
                {t.title}
              </Link>
              <p className="mt-2 text-sm text-muted">{t.d}</p>
            </li>
          ))}
        </ul>
      </main>
      <PublicFooter />
    </div>
  );
}

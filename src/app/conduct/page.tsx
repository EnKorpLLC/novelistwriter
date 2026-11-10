import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "Conduct rules for authors and readers",
  description: "How beta reading and advance copies work here: honest feedback given kindly, respect both ways, private reports, and blocking.",
  path: "/conduct",
  kicker: "Conduct",
});

const AUTHORS = [
  "Say up front what feedback you want, how rough the draft is, and how long it takes. Readers rely on it.",
  "Thank readers for their time, even when the feedback is hard to hear.",
  "Never argue with, belittle, or pressure a reader about their feedback. Disagree in your revision, not in their inbox.",
  "Don't ask readers for anything beyond reading and feedback: no personal favors, no money, no off-platform contact they didn't offer.",
  "Never ask for positive reviews. Ask for honest ones.",
];

const READERS = [
  "Be honest and kind. Say what didn't work and why, about the book, never about the author.",
  "Finish by the end date or say you're stepping away. A DNF with a reason helps the author.",
  "Keep manuscripts private: no sharing, copying, or posting them anywhere.",
  "Leave ARC reviews where you said you would, and say you got a free copy where the store asks for it.",
];

export default function ConductPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Conduct</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Honest feedback, given kindly</h1>
        <p className="mt-4 text-lg text-muted">
          Beta reading and advance copies only work when both sides feel safe: authors to share an unfinished book, readers to say what
          they really think. These rules keep it that way.
        </p>

        <h2 className="font-display mt-10 text-2xl">For authors</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          {AUTHORS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        <h2 className="font-display mt-10 text-2xl">For readers</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          {READERS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        <h2 className="font-display mt-10 text-2xl">Reporting and blocking</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          <li>Anyone can report a problem privately from a book page or the reading screen. Only Novelist Writer sees reports, and nobody is told who sent one.</li>
          <li>Readers can block an author. The author&apos;s books leave the reader&apos;s catalog, and the author can&apos;t invite or message them.</li>
          <li>
            We never publicly flag a book as AI-written; false accusations hurt real authors. Concerns about how a book was written are checked privately against its{" "}
            <Link href="/human-authorship-standard" className="text-accent underline">
              writing record
            </Link>
            .
          </li>
          <li>Authors who are reported for their conduct by several readers can lose access to the reader catalog. Readers can lose access to beta reads and advance copies the same way.</li>
        </ul>
        <p className="mt-10 text-sm text-muted">
          Questions about a report? <Link href="/contact" className="text-accent underline">Contact us</Link>.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

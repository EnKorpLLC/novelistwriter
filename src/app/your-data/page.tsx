import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "Your data, your exit",
  description: "Your manuscripts, readers, and records are yours. Export everything anytime, on every plan, with no lock-in.",
  path: "/your-data",
  kicker: "Our promise",
});

const ITEMS = [
  { t: "Your manuscript", d: "Download any book as Word (DOCX) or EPUB on every plan, including Free, and even if a project is locked after a plan ends." },
  { t: "Your readers", d: "Export your email subscribers, beta readers, and ARC readers as CSV from the Audience page, to use in any newsletter tool." },
  { t: "Your reader feedback", d: "On Studio, export every comment, reply, final review, DNF reason, and ARC review as a Word document. If Studio ends, it's kept and unlocks again when you're back." },
  { t: "Your writing record", d: "Your record of how each book was written stays yours. Publish it, keep it private, or leave it behind." },
  { t: "Your account", d: "Want to leave for good? Contact us and we'll delete your books and personal data, and confirm when it's done." },
];

export default function YourDataPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Our promise</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Your data, your exit</h1>
        <p className="mt-4 text-lg text-muted">
          You should stay because Novelist Writer is useful, not because leaving is hard. Your books and reader lists can go
          with you, on every plan.
        </p>
        <ul className="mt-10 space-y-6">
          {ITEMS.map((i) => (
            <li key={i.t} className="border-t border-line pt-4">
              <h2 className="font-display text-xl">{i.t}</h2>
              <p className="mt-1 text-muted">{i.d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-muted">
          We never train AI on your manuscript, and we never sell your data or your readers&apos; data. Read the{" "}
          <Link href="/privacy" className="text-accent underline">
            privacy promise
          </Link>{" "}
          for details.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

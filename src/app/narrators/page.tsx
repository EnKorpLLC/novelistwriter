import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";
import { NARRATION_FEE_PCT } from "@/lib/narration";

export const metadata = contentMetadata({
  title: "For narrators",
  description:
    "Narrate audiobooks for Novelist Writer authors: a free account, a plain-language agreement, a 15-minute checkpoint, a held deposit, your full rate paid to your bank, and human narration only.",
  path: "/narrators",
  kicker: "For narrators",
});

const SECTIONS: { t: string; d: string[] }[] = [
  {
    t: "Free, always",
    d: ["Your narrator account costs nothing, now or later. Authors pay for the studio on their Studio plan; you never pay to record, get paid, or keep your work."],
  },
  {
    t: "How work reaches you",
    d: [
      "An author invites you by email from their book's Audio tab. The invite shows the book and the full agreement before you say yes.",
      "Your account opens only that book's script, the recording studio, and the author's notes. Never their other books or anything else of theirs.",
    ],
  },
  {
    t: "The agreement, in plain words",
    d: [
      "Pay per finished hour (the length of the final, approved audio) or a royalty share. A royalty share only covers audiobook sales made here on Novelist Writer, paid to you as each sale clears its 14-day refund window; sales on Audible and other stores pay the author directly, so the agreement says plainly that they aren't shared.",
      "It also sets the revision rounds included (two by default), the deadline, and a cancellation fee. Fixing your own slips is always included; changes to the text after you've recorded it aren't.",
    ],
  },
  {
    t: "The checkpoint and the deposit",
    d: [
      "You record about 15 minutes first. The author approves it, or asks for changes, before full production. On a per-hour job, approving the checkpoint is when the author pays a deposit of half the estimate, which we hold until the book is delivered.",
    ],
  },
  {
    t: "Recording",
    d: [
      "Record in your browser (Chrome or Edge on a computer works best) with the script on screen, a room and level check, and one-click pickups from any sentence. Your recordings stay on your own computer.",
      "Send each chapter as a small review copy. The author listens with the text alongside and pins notes to exact lines, so you only re-record those. Review copies are deleted once the chapter is approved, or after 30 days.",
      "When it's done, the studio masters everything to ACX's audio specs and you deliver the finished files to the author through us.",
    ],
  },
  {
    t: "Getting paid",
    d: [
      `You get your full rate. Our ${NARRATION_FEE_PCT}% fee is paid by the author, on top.`,
      "When the author pays the balance, your fee goes to your bank through Stripe, usually within a few days. Set up payouts once from your narrator dashboard.",
      "If the author doesn't answer a delivered chapter for 14 days, it counts as approved. If they cancel after the checkpoint, you're paid for approved work plus the agreed cancellation fee, out of the deposit we're holding.",
    ],
  },
  {
    t: "Credit, and human narration only",
    d: [
      "You're credited in the opening and closing credits and on the book's page. Audiobooks recorded in our studio can carry a \u201cRecorded in Novelist Writer\u201d badge, backed by the narration record.",
      "The agreement rules out AI voice generation and cloning. That's the point of the place.",
    ],
  },
];

export default function NarratorsPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">For narrators</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Narrate here, get paid on time</h1>
        <p className="mt-4 text-lg text-muted">
          A free account, an agreement that protects you, a deposit held before full production, and your full rate sent to your bank when the book is done.
        </p>
        <ul className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <li key={s.t} className="border-t border-line pt-4">
              <h2 className="font-display text-2xl">{s.t}</h2>
              {s.d.map((p) => (
                <p key={p.slice(0, 40)} className="mt-3 text-muted">
                  {p}
                </p>
              ))}
            </li>
          ))}
        </ul>
        <section className="font-ui mt-12 border border-accent p-5 text-sm">
          <p className="text-ink">Already narrate for an author who writes here? Ask them to invite you from their book&apos;s Audio tab. Already invited?</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/narrator" className="bg-accent px-4 py-2 text-paper">
              Open your narrator dashboard
            </Link>
            <Link href="/authors" className="border border-line px-4 py-2">
              What authors get
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted">A directory where authors can find narrators is planned. Questions? <Link href="/contact" className="underline">Contact us</Link>.</p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

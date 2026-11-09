import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { WriteHereCta } from "@/components/WriteHereCta";
import { WritingPaceTool } from "@/components/WritingPaceTool";
import { contentMetadata } from "@/lib/seo";

export const metadata = contentMetadata({
  title: "Writing pace calculator",
  description: "How many words a day you need to finish your novel by a deadline, or when you'll finish at your current pace. Free, no sign-up.",
  path: "/tools/writing-pace",
  kicker: "Free author tool",
});

export default function WritingPacePage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-6 py-12 md:px-10">
        <Link href="/tools" className="font-ui text-sm text-accent hover:underline">
          ← Free tools
        </Link>
        <h1 className="font-display mt-4 text-4xl">Writing pace calculator</h1>
        <p className="mt-3 text-muted">
          An 80,000-word novel at 1,000 words a day, five days a week, takes about 16 weeks. Put in your own numbers below.
        </p>
        <div className="mt-8">
          <WritingPaceTool />
        </div>
        <p className="font-ui mt-6 text-sm text-muted">
          Want company? Join a{" "}
          <Link href="/challenges" className="text-accent underline">
            writing challenge
          </Link>
          , where every word is verified and streaks keep you going.
        </p>
        <WriteHereCta line="Novelist Writer sets a daily word goal, tracks your streak, and counts only the words you type, so your progress is real." />
      </main>
      <PublicFooter />
    </div>
  );
}

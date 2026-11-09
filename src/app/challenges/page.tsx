import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { createServiceClient } from "@/lib/supabase/admin";
import { challengeStatus, type Challenge } from "@/lib/challenges";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verified writing challenges — Novelist Writer",
  description:
    "Free writing challenges where every word is verified: only words you type count, never pasted or imported text. Join a challenge, keep a streak, and earn a winner badge.",
  alternates: { canonical: "/challenges" },
};

function dates(c: Challenge) {
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${f(c.starts_on)} – ${f(c.ends_on)}`;
}

export default async function ChallengesPage() {
  const admin = createServiceClient();
  const { data } = await admin.from("challenges").select("*").eq("is_public", true).order("starts_on", { ascending: false }).limit(60);
  const all = (data || []) as Challenge[];
  const groups = (["active", "upcoming", "ended"] as const).map((s) => ({ status: s, list: all.filter((c) => challengeStatus(c) === s) }));
  const label = { active: "Running now", upcoming: "Coming up", ended: "Past challenges" };

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Writing challenges</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Write more. Prove every word.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Free challenges for every writer. Your words are counted from your writing record, so only what you type in the
          editor counts. Pasted, imported, and deleted text never does, and nobody can fake a total.
        </p>
        <div className="font-ui mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="bg-ink px-5 py-2.5 text-paper hover:bg-accent">
            Start writing free
          </Link>
          <Link href="/dashboard/challenges" className="border border-ink/20 px-5 py-2.5 text-ink hover:border-accent hover:text-accent">
            Your challenges, or start one with friends
          </Link>
        </div>

        {all.length === 0 && <p className="mt-12 text-muted">The first challenge is being set up. Check back soon.</p>}

        {groups
          .filter((g) => g.list.length)
          .map((g) => (
            <section key={g.status} className="mt-12">
              <h2 className="font-display text-2xl">{label[g.status]}</h2>
              <ul className="mt-4 grid gap-4 md:grid-cols-2">
                {g.list.map((c) => (
                  <li key={c.id} className="border border-line p-5">
                    <Link href={`/challenges/${c.slug}`} className="font-display text-xl hover:text-accent">
                      {c.title}
                    </Link>
                    <p className="font-ui mt-1 text-xs text-muted">
                      {dates(c)} · {c.goal_words.toLocaleString()} words
                    </p>
                    {c.description && <p className="mt-2 line-clamp-3 text-sm text-muted">{c.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}

        <section className="mt-16 border-t border-line pt-10">
          <h2 className="font-display text-2xl">How verified counting works</h2>
          <ul className="mt-4 grid gap-6 md:grid-cols-3">
            {[
              { t: "Typed, not pasted", d: "Each day counts the words your books grew by, but never more than you typed in the editor that day." },
              { t: "Your own time zone", d: "Challenge days follow your local calendar, so midnight is your midnight." },
              { t: "Streaks and badges", d: "Write 50 verified words in a day to keep your streak. Reach the goal to earn a winner badge for your author page." },
            ].map((x) => (
              <li key={x.t} className="border-t border-line pt-3">
                <h3 className="font-display text-lg">{x.t}</h3>
                <p className="mt-1 text-sm text-muted">{x.d}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

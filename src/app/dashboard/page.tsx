import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CreateProjectButton } from "@/components/CreateProjectButton";
import { SignOutButton } from "@/components/SignOutButton";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";

function formatWords(n: number) {
  if (n >= 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString();
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: projects }, { data: credits }, { data: profile }, { data: chapterRows }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase.from("credit_balances").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("chapters").select("project_id, word_count").eq("user_id", user.id),
    ]);

  const stats = new Map<string, { chapters: number; words: number }>();
  for (const row of chapterRows ?? []) {
    const cur = stats.get(row.project_id) ?? { chapters: 0, words: 0 };
    cur.chapters += 1;
    cur.words += row.word_count || 0;
    stats.set(row.project_id, cur);
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: day } = await supabase
    .from("writing_days")
    .select("words_written")
    .eq("user_id", user.id)
    .eq("day", today)
    .maybeSingle();

  const goal = profile?.word_goal_daily ?? 500;
  const written = day?.words_written ?? 0;

  return (
    <div className="min-h-screen">
      <header className="font-ui flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
        <Link href="/dashboard" className="font-display text-xl">
          Novelist Writer
        </Link>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted">
            Credits:{" "}
            <strong className="text-ink">
              {(credits?.balance ?? 0) + (credits?.monthly_allowance_remaining ?? 0)}
            </strong>
            {credits?.subscription_tier && credits.subscription_tier !== "free" && (
              <span className="ml-2 uppercase tracking-wide text-accent">
                {credits.subscription_tier}
              </span>
            )}
          </span>
          <Link href="/billing" className="text-accent hover:underline">
            Billing
          </Link>
          <Link href="/settings" className="text-muted hover:text-ink">
            Settings
          </Link>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl">Your projects</h1>
            <p className="mt-1 text-sm text-muted">
              Today&apos;s words: {written} / {goal}
            </p>
          </div>
          <CreateProjectButton />
        </div>

        <ul className="mt-10 space-y-3">
          {(projects ?? []).length === 0 && (
            <li className="border border-dashed border-line p-8 text-center text-muted">
              No projects yet. Your first novel is free — start writing.
            </li>
          )}
          {(projects ?? []).map((p) => {
            const s = stats.get(p.id) ?? { chapters: 0, words: 0 };
            const coverUrl = coverPublicUrl(projectCoverPath(p));
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 border border-line bg-paper px-5 py-4 transition hover:border-accent"
              >
                <Link href={`/project/${p.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="relative h-16 w-11 shrink-0 overflow-hidden border border-line bg-paper-deep">
                    {coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-muted">
                        —
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-xl">{p.title}</h2>
                    <p className="text-sm text-muted">
                      {s.chapters} {s.chapters === 1 ? "chapter" : "chapters"} ·{" "}
                      {formatWords(s.words)} words
                      {(p.genre || p.pov || p.status) && (
                        <>
                          {" "}
                          · {p.genre || "No genre"} · {p.pov || "POV TBD"} · {p.status}
                        </>
                      )}
                    </p>
                  </div>
                </Link>
                <div className="font-ui flex shrink-0 items-center gap-4 text-sm">
                  <DeleteProjectButton projectId={p.id} title={p.title} />
                  <Link href={`/project/${p.id}`} className="text-accent">
                    Open →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

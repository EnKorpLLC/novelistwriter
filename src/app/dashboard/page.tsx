import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CreateProjectButton } from "@/components/CreateProjectButton";
import { SignOutButton } from "@/components/SignOutButton";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: projects }, { data: credits }, { data: profile }] = await Promise.all([
    supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("credit_balances").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
  ]);

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
          {(projects ?? []).map((p) => (
            <li key={p.id}>
              <Link
                href={`/project/${p.id}`}
                className="flex items-center justify-between border border-line bg-paper px-5 py-4 transition hover:border-accent"
              >
                <div>
                  <h2 className="font-display text-xl">{p.title}</h2>
                  <p className="text-sm text-muted">
                    {p.genre || "No genre"} · {p.pov || "POV TBD"} · {p.status}
                  </p>
                </div>
                <span className="font-ui text-sm text-accent">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

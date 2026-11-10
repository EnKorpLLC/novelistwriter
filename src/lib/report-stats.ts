import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { genreLabel } from "@/lib/beta-platform";
import type { ReportData } from "@/lib/content";

/** No number is published unless at least this many people stand behind it, so nobody can be picked out. */
export const MIN_GROUP = 10;
/** Genre rows also need books from at least this many different authors. */
const MIN_AUTHORS = 3;

const pct = (n: number) => `${Math.round(n * 100)}%`;
function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Anonymous platform-wide totals for a data report, over the last `days` days. */
export async function computeReportStats(admin: SupabaseClient, days = 90): Promise<ReportData> {
  const since = new Date(Date.now() - days * 86_400_000);
  const sinceDay = since.toISOString().slice(0, 10);
  const sections: ReportData["sections"] = [];

  // Writing
  const writingDays = await fetchAll<{ user_id: string; words_written: number }>((f, t) =>
    admin.from("writing_days").select("user_id, words_written").gte("day", sinceDay).gt("words_written", 0).range(f, t)
  ).catch(() => []);
  const writers = new Set(writingDays.map((d) => d.user_id)).size;
  if (writers >= MIN_GROUP) {
    const words = writingDays.map((d) => d.words_written);
    const perWriter = new Map<string, number>();
    for (const d of writingDays) perWriter.set(d.user_id, (perWriter.get(d.user_id) || 0) + 1);
    sections.push({
      title: "How writers write",
      note: `${writers.toLocaleString()} writers, ${writingDays.length.toLocaleString()} writing days.`,
      rows: [
        { label: "Words on a typical writing day (median)", value: median(words), display: median(words).toLocaleString() },
        { label: "Writing days over 1,000 words", value: words.filter((w) => w > 1000).length / words.length, display: pct(words.filter((w) => w > 1000).length / words.length) },
        { label: "Writing days per writer (median)", value: median([...perWriter.values()]), display: String(median([...perWriter.values()])) },
      ],
    });
  }

  // Beta reading: who finished, who stopped, by genre
  const invites = await fetchAll<{ project_id: string; user_id: string; status: string; finished_at: string | null; dnf_at: string | null }>((f, t) =>
    admin.from("beta_invites").select("project_id, user_id, status, finished_at, dnf_at").gte("created_at", since.toISOString()).in("status", ["accepted", "dnf"]).range(f, t)
  ).catch(() => []);
  if (invites.length >= MIN_GROUP) {
    const projectIds = [...new Set(invites.map((i) => i.project_id))];
    const { data: projects } = await admin.from("projects").select("id, genre").in("id", projectIds.slice(0, 1000));
    const genreOf = new Map((projects || []).map((p) => [p.id as string, genreLabel(p.genre)]));
    const finished = invites.filter((i) => i.finished_at).length;
    const stopped = invites.filter((i) => i.status === "dnf" || i.dnf_at).length;
    const rows: ReportData["sections"][number]["rows"] = [
      { label: "Beta readers who finished the book", value: finished / invites.length, display: pct(finished / invites.length) },
      { label: "Beta readers who stopped and said so (DNF)", value: stopped / invites.length, display: pct(stopped / invites.length) },
    ];
    const byGenre = new Map<string, { n: number; done: number; authors: Set<string> }>();
    for (const i of invites) {
      const g = genreOf.get(i.project_id) || "Uncategorized";
      if (g === "Uncategorized") continue;
      const e = byGenre.get(g) || { n: 0, done: 0, authors: new Set<string>() };
      e.n += 1;
      if (i.finished_at) e.done += 1;
      e.authors.add(i.user_id);
      byGenre.set(g, e);
    }
    for (const [g, e] of [...byGenre.entries()].sort((a, b) => b[1].n - a[1].n)) {
      if (e.n < MIN_GROUP || e.authors.size < MIN_AUTHORS) continue;
      rows.push({ label: `Finish rate: ${g}`, value: e.done / e.n, display: pct(e.done / e.n) });
    }
    sections.push({ title: "Beta reading", note: `${invites.length.toLocaleString()} beta reads started.`, rows });
  }

  // Advance copies: finished readers who posted a review
  const arcs = await fetchAll<{ review_posts: Record<string, string> | null }>((f, t) =>
    admin.from("arc_invites").select("review_posts").not("finished_at", "is", null).gte("finished_at", since.toISOString()).range(f, t)
  ).catch(() => []);
  if (arcs.length >= MIN_GROUP) {
    const posted = arcs.filter((a) => Object.keys(a.review_posts || {}).length > 0).length;
    sections.push({
      title: "Advance reader copies",
      note: `${arcs.length.toLocaleString()} advance copies finished.`,
      rows: [{ label: "Finished ARC readers who posted a review", value: posted / arcs.length, display: pct(posted / arcs.length) }],
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    period: `${sinceDay} to ${new Date().toISOString().slice(0, 10)}`,
    minGroup: MIN_GROUP,
    sections,
  };
}

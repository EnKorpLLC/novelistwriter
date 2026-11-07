import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/admin";
import { safeSegment } from "@/lib/public-site";
import { publicReaderName } from "@/lib/beta-access";
import { readerBadgeStatsFor } from "@/lib/beta-social";
import { PublicHeader } from "@/components/PublicHeader";
import { ReaderBadgeList } from "@/components/TrustBadges";

export const dynamic = "force-dynamic";

/** Only readers who turned on their public profile; otherwise the page doesn't exist. */
async function loadReader(rawHandle: string) {
  const handle = safeSegment(rawHandle);
  if (!handle) return null;
  const admin = createServiceClient();
  const { data: p, error } = await admin
    .from("profiles")
    .select("id, handle, display_name, email, created_at, reader_profile_public")
    .ilike("handle", handle)
    .maybeSingle();
  if (error || !p?.reader_profile_public) return null;
  const badgeMap = await readerBadgeStatsFor(admin, [{ userId: p.id }]);
  const mine = badgeMap.get(p.id);
  return {
    handle: p.handle as string,
    name: publicReaderName(p.display_name, p.email, "Reader"),
    since: p.created_at as string | null,
    badges: mine?.badges || [],
    stats: mine?.stats || null,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const reader = await loadReader(handle);
  if (!reader) return { title: "Reader not found" };
  const title = `${reader.name}, reader on Novelist Writer`;
  const description = reader.badges.length
    ? `Badges: ${reader.badges.map((b) => b.label).join(", ")}.`
    : `${reader.name} beta reads and reviews advance copies on Novelist Writer.`;
  return {
    title,
    description,
    alternates: { canonical: `/r/${reader.handle}` },
    openGraph: { title, description, type: "profile" },
  };
}

export default async function ReaderProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const reader = await loadReader(handle);
  if (!reader) notFound();
  const s = reader.stats;
  const stats: [string, string][] = s
    ? [
        ["Books finished", String(s.booksFinished)],
        ["ARCs finished on time", String(s.arcsOnTime)],
        ["Reviews posted", String(s.reviewsPosted)],
        ["Feedback comments", String(s.comments)],
        ...(s.ratingCount >= 3 && s.avgRating != null
          ? ([["Author rating", `${s.avgRating.toFixed(1)} from ${s.ratingCount}`]] as [string, string][])
          : []),
      ]
    : [];

  return (
    <div className="min-h-screen bg-paper text-ink">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="font-ui text-xs uppercase tracking-wide text-muted">Reader</p>
        <h1 className="font-display mt-1 text-4xl">{reader.name}</h1>
        {reader.since && (
          <p className="font-ui mt-1 text-sm text-muted">
            Reading on Novelist Writer since{" "}
            {new Date(reader.since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        )}

        <section className="mt-8">
          <h2 className="font-display text-2xl">Badges</h2>
          {reader.badges.length ? (
            <ReaderBadgeList badges={reader.badges} showDetail className="mt-3" />
          ) : (
            <p className="font-ui mt-2 text-sm text-muted">No badges yet.</p>
          )}
        </section>

        {stats.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-2xl">Reading</h2>
            <dl className="font-ui mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stats.map(([label, value]) => (
                <div key={label} className="border border-line px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="font-display text-2xl text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <p className="font-ui mt-10 text-sm text-muted">
          Want readers like this for your book?{" "}
          <Link href="/authors" className="text-accent underline">
            See what authors get
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

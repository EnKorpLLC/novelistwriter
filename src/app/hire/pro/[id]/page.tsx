import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { createServiceClient } from "@/lib/supabase/admin";
import { directoryPros, typeStatuses } from "@/lib/marketplace";
import { MARKET_TYPES, isMarketType, marketType } from "@/lib/market-types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pro profile | Novelist Writer", robots: { index: false, follow: true } };

/** A pro's profile: shown once one of their types is open to authors. */
export default async function ProProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const { id } = await params;
  const { type } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createServiceClient();
  const statuses = (await typeStatuses(admin)) || [];
  const openTypes = statuses.filter((s) => s.state === "open").map((s) => s.id);
  const lookup = isMarketType(type) ? type : MARKET_TYPES.find((t) => openTypes.includes(t.id))?.id;
  const pro = lookup ? (await directoryPros(admin, lookup, { withPortfolio: true, userId: id }))[0] : null;
  if (!pro || !pro.specialties.some((s) => openTypes.includes(s as (typeof openTypes)[number]))) notFound();
  const hireable = pro.specialties.filter((s) => openTypes.includes(s as (typeof openTypes)[number]) && s !== "narration");

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">{pro.specialties.map((s) => marketType(s)?.label).filter(Boolean).join(" · ")}</p>
        <h1 className="font-display mt-2 text-4xl">{pro.name}</h1>
        <p className="mt-2 text-lg text-muted">{pro.headline}</p>
        <p className="font-ui mt-2 text-xs text-muted">
          {pro.founding ? "Founding pro · " : ""}
          {pro.completed ? `${pro.completed} ${pro.completed === 1 ? "job" : "jobs"} completed here · ` : ""}
          Promises human-made work
          {pro.genres.length ? ` · ${pro.genres.join(", ")}` : ""}
        </p>
        <p className="mt-6 whitespace-pre-wrap">{pro.bio}</p>
        <p className="font-ui mt-4 text-sm text-muted">
          {pro.rateNote && <>Rates: {pro.rateNote}. </>}
          {pro.turnaroundNote && <>Turnaround: {pro.turnaroundNote}. </>}
          {pro.website && (
            <a href={pro.website} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline">
              Website
            </a>
          )}
        </p>
        <div className="font-ui mt-6 flex flex-wrap gap-3">
          {hireable.map((s) => (
            <Link key={s} href={`/dashboard/hire?type=${s}&pro=${pro.userId}`} className="bg-accent px-4 py-2 text-sm text-paper">
              Request a quote{hireable.length > 1 ? `: ${marketType(s)?.label.toLowerCase()}` : ""}
            </Link>
          ))}
          {pro.specialties.includes("narration") && <span className="text-sm text-muted">To hire them as a narrator, invite them from your book&apos;s Audio tab.</span>}
        </div>
        {pro.portfolio.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl">Portfolio</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {pro.portfolio.map((i) => (
                <li key={i.id} className="font-ui border border-line p-3 text-sm">
                  {i.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.imageUrl} alt={i.title} className="mb-2 max-h-72 w-full object-contain" />
                  )}
                  <p className="text-ink">{i.title}</p>
                  {i.note && <p className="text-xs text-muted">{i.note}</p>}
                  {i.url && (
                    <a href={i.url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-accent underline">
                      See it
                    </a>
                  )}
                  {i.before && (
                    <div className="mt-2 grid gap-2 text-xs">
                      <p className="whitespace-pre-wrap text-muted">
                        <strong>Before:</strong> {i.before}
                      </p>
                      <p className="whitespace-pre-wrap">
                        <strong>After:</strong> {i.after}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import type { Verification } from "@/lib/verify";

export const dynamic = "force-dynamic";

type Params = { code: string };

async function load(raw: string): Promise<{ code: string | null; v: Verification | null }> {
  const { findVerification } = await import("@/lib/verify");
  return findVerification(raw);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { v } = await load((await params).code);
  if (!v) return { title: "Verification not found", robots: { index: false } };
  const description = `${v.label}: ${v.title} by ${v.author}. ${v.sessions} writing sessions over ${v.spanDays} days, ${v.typedPercent}% typed. Checked by Novelist Writer.`;
  return {
    title: `${v.title}: ${v.label}`,
    description,
    alternates: { canonical: `/verify/${v.code}` },
    openGraph: { title: `${v.title}: ${v.label}`, description },
  };
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—");

export default async function VerifyCodePage({ params }: { params: Promise<Params> }) {
  const raw = (await params).code;
  const { code, v } = await load(raw);
  // Send "nw-abcd-efgh" and other spellings to the one canonical address
  if (v && code && raw !== code) redirect(`/verify/${code}`);
  if (!v) notFound();

  const facts: [string, string][] = [
    ["Typed in the editor", `${v.typedPercent}%`],
    ["Pasted in", `${v.pastedPercent}%`],
    ["Imported from a file", `${v.importedPercent}%`],
    ["Written before records began", `${v.beforeRecordsPercent}%`],
    ["Writing sessions", v.sessions.toLocaleString()],
    ["Days with writing", v.activeDays.toLocaleString()],
    ["Written over", `${v.spanDays.toLocaleString()} days`],
    ["Saved revisions", v.revisions.toLocaleString()],
    ["First session", date(v.firstSession)],
    ["Latest session", date(v.lastSession)],
  ];

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="font-ui text-xs uppercase tracking-wide text-muted">Verification {v.display}</p>
        <div className="mt-3 flex flex-wrap items-start gap-6">
          {v.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.coverUrl} alt="" className="h-40 w-28 border border-line object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl">{v.title}</h1>
            <p className="font-ui mt-1 text-sm text-muted">
              by{" "}
              {v.authorUrl ? (
                <a href={v.authorUrl} className="text-accent underline">
                  {v.author}
                </a>
              ) : (
                v.author
              )}
            </p>
            <p className={`font-ui mt-4 inline-block border px-3 py-1.5 text-sm ${v.status === "record" ? "border-line text-ink" : "border-accent text-accent"}`}>
              ✓ {v.label}
            </p>
            <ul className="font-ui mt-3 space-y-1 text-sm">
              <li>{v.writtenHere ? "✓ Meets the “Written in Novelist Writer” standard: typed here across many sessions and weeks." : "Doesn't meet the “Written in Novelist Writer” standard yet."}</li>
              <li>{v.noAiOnBook ? "✓ No AI tool was ever run on this book in Novelist Writer." : "AI tools in Novelist Writer were used on this book (critique only: our AI never writes)."}</li>
              {v.aiOffSince && <li>✓ The author has had every AI tool switched off since {date(v.aiOffSince)}.</li>}
            </ul>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-2xl">The writing record</h2>
          <p className="font-ui mt-1 text-sm text-muted">
            Numbers only. Novelist Writer records how text arrived in the editor and when, never what it says. {v.currentWords.toLocaleString()} words
            in the book today.
          </p>
          <dl className="font-ui mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label} className="border border-line px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
                <dd className="font-display text-xl text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="font-ui mt-4 text-sm">
            {v.recordUrl && (
              <>
                <a href={v.recordUrl} className="text-accent underline">
                  See the full writing record
                </a>
                {" · "}
              </>
            )}
            {v.bookUrl && (
              <>
                <a href={v.bookUrl} className="text-accent underline">
                  About the book
                </a>
                {" · "}
              </>
            )}
            <Link href="/human-authorship-standard" className="text-accent underline">
              How we verify
            </Link>
          </p>
        </section>

        <p className="font-ui mt-10 border-t border-line pt-4 text-xs text-muted">
          Checked {date(v.checkedAt)}. This page updates as the author writes, and disappears if they turn verification off. Run a platform? Read it as
          JSON at{" "}
          <a href={`/api/verify/${v.code}`} className="underline">
            /api/verify/{v.code}
          </a>
          . <Link href="/verify#platforms" className="underline">More for platforms</Link>
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

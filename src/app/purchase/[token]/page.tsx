import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your ebook | Novelist Writer", robots: { index: false, follow: false } };

async function load(token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const admin = createServiceClient();
    // select("*") so the page works before and after the audiobook migration adds format
    const { data: p } = await admin.from("book_purchases").select("*").eq("download_token", token).maybeSingle();
    if (!p) return null;
    const { data: project } = p.project_id ? await admin.from("projects").select("cover_path, metadata, updated_at").eq("id", p.project_id).maybeSingle() : { data: null };
    // The rest of a bundle or an ebook + audiobook set bought in the same checkout
    const { data: others } = p.order_ref
      ? await admin.from("book_purchases").select("*").eq("order_ref", p.order_ref).neq("download_token", token).order("stripe_session_id")
      : { data: [] as Record<string, unknown>[] };
    const isAudio = p.format === "audiobook";
    let audio: { title: string; durationMs: number; url: string; download: string; fileName: string }[] = [];
    if (isAudio && p.status === "paid" && p.project_id) {
      const { audiobookFiles, signedFiles } = await import("@/lib/audiobook-sales");
      const files = ((await audiobookFiles(admin, p.project_id)) || []).filter((f) => !f.isSample);
      const [listen, download] = await Promise.all([signedFiles(files, p.project_id), signedFiles(files, p.project_id, { download: true })]);
      audio = listen.map((f, i) => ({ title: f.title, durationMs: f.durationMs, url: f.url, download: download[i].url, fileName: f.fileName }));
    }
    return {
      title: p.title as string,
      status: p.status as string,
      buyer_email: p.buyer_email as string,
      buyer_name: (p.buyer_name as string) || "",
      buyer_user_id: p.buyer_user_id as string | null,
      price_cents: p.price_cents as number,
      isAudio,
      audio,
      coverUrl: project ? coverPublicUrl(projectCoverPath(project), project.updated_at ? Date.parse(project.updated_at) : undefined) : null,
      others: (others || []).map((o) => ({ title: o.title as string, download_token: o.download_token as string, isAudio: o.format === "audiobook" })),
    };
  } catch {
    return null;
  }
}

/** The lasting download page from the receipt email. */
export default async function PurchasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await load(token);
  if (!p) notFound();
  const refunded = p.status !== "paid";
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex flex-wrap items-start gap-6">
          {p.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.coverUrl} alt="" className="h-48 w-32 border border-line object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-ui text-xs uppercase tracking-wide text-muted">{p.isAudio ? "Your audiobook" : "Your ebook"}</p>
            <h1 className="font-display mt-1 text-3xl">{p.title}</h1>
            {refunded ? (
              <p className="font-ui mt-4 text-sm text-muted">This purchase was refunded, so the download is no longer available.</p>
            ) : p.isAudio ? (
              <p className="font-ui mt-3 text-sm text-muted">
                Listen here, or download the MP3 files to keep and play in any app. This copy belongs to {p.buyer_name || p.buyer_email}; please don&apos;t share or resell it.
              </p>
            ) : (
              <>
                <a href={`/purchase/${token}/epub`} className="font-ui mt-5 inline-block bg-accent px-5 py-2.5 text-paper">
                  Download the EPUB
                </a>
                <p className="font-ui mt-2 text-xs text-muted">Yours to keep. This page and the link in your receipt keep working whenever you need the file again.</p>
              </>
            )}
          </div>
        </div>
        {!refunded && p.isAudio && p.audio.length > 0 && (
          <section className="font-ui mt-8 text-sm">
            <ol className="divide-y divide-line border-y border-line">
              {p.audio.map((f, i) => (
                <li key={f.fileName} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-display text-base">
                      {i + 1}. {f.title}
                    </span>
                    <span className="text-xs text-muted">
                      {Math.round(f.durationMs / 60000)} min ·{" "}
                      <a href={f.download} className="text-accent underline">
                        Download MP3
                      </a>
                    </span>
                  </div>
                  <audio controls preload="none" src={f.url} className="mt-2 w-full" />
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-muted">The links on this page refresh each time you open it. Listening with your place saved across devices is coming to your library.</p>
          </section>
        )}
        {!refunded && p.others.length > 0 && (
          <section className="font-ui mt-8 border-t border-line pt-4 text-sm">
            <h2 className="font-display text-xl">Also in this order</h2>
            <ul className="mt-2 space-y-2">
              {p.others.map((o) => (
                <li key={o.download_token} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-base">{o.title}</span>
                  <a href={o.isAudio ? `/purchase/${o.download_token}` : `/purchase/${o.download_token}/epub`} className="border border-accent px-3 py-1 text-xs text-accent">
                    {o.isAudio ? "Listen and download" : "Download the EPUB"}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!refunded && !p.isAudio && (
          <section className="font-ui mt-10 space-y-3 text-sm">
            <h2 className="font-display text-xl">Reading it</h2>
            <p>
              <strong>Kindle:</strong> go to amazon.com/sendtokindle and drag the file in, or email it to your Kindle address (find it under Devices in your
              Amazon account). It shows up in your Kindle library in a few minutes.
            </p>
            <p>
              <strong>Kobo, Apple Books, Google Play Books, and most other apps:</strong> open the EPUB file directly.
            </p>
          </section>
        )}
        <p className="font-ui mt-10 border-t border-line pt-4 text-sm text-muted">
          {p.buyer_user_id ? (
            <>
              It&apos;s also in your{" "}
              <Link href="/library" className="text-accent underline">
                library
              </Link>
              .
            </>
          ) : (
            <>
              Keep every book you buy in one place:{" "}
              <Link href={`/beta/signup?email=${encodeURIComponent(p.buyer_email)}&next=/library`} className="text-accent underline">
                create a free reader account
              </Link>{" "}
              with {p.buyer_email}.
            </>
          )}{" "}
          {p.price_cents > 0 && (
            <>
              Questions or a refund within 14 days? Reply to your receipt email, or see the{" "}
              <Link href="/refunds" className="text-accent underline">
                refund policy
              </Link>
              .
            </>
          )}
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

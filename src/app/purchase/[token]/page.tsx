import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { AudiobookPlayer } from "@/components/AudiobookPlayer";
import { PreorderActions } from "@/components/PreorderActions";
import { PREORDER_GRACE_DAYS, addDays, longDay } from "@/lib/direct-sale-rules";
import { CANCEL_MINUTES, PRINT_DAYS } from "@/lib/print-rules";
import { PaperbackCancel } from "@/components/PaperbackCancel";
import { ReviewForm } from "@/components/ReviewForm";

/** Where a printed order is, in plain words. */
function printLine(status: string | null, shippedAt: string | null) {
  if (status === "SHIPPED" || shippedAt) return `Shipped${shippedAt ? ` on ${new Date(shippedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}` : ""}.`;
  if (status === "DELIVERED") return "Delivered.";
  if (status === "IN_PRODUCTION" || status === "PRODUCTION_READY") return `Being printed now. It ships in about ${PRINT_DAYS}.`;
  if (status === "CANCELED") return "This order was cancelled.";
  if (status === "REJECTED" || status === "ERROR" || status === "failed") return "There's a problem with the printing. We're on it, and if it can't be printed you'll be refunded in full.";
  return `Ordered. Printing starts within the hour and takes about ${PRINT_DAYS}, then it ships; you'll get tracking by email.`;
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your book | Novelist Writer", robots: { index: false, follow: false } };

async function load(token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const admin = createServiceClient();
    // select("*") so the page works before and after the audiobook migration adds format
    const { data: p } = await admin.from("book_purchases").select("*").eq("download_token", token).maybeSingle();
    if (!p) return null;
    const { data: project } = p.project_id ? await admin.from("projects").select("cover_path, metadata, updated_at, user_id, release_date, published").eq("id", p.project_id).maybeSingle() : { data: null };
    // A box set's own cover, not its first book's
    const { data: boxSet } = p.box_set_id ? await admin.from("box_sets").select("cover_path, updated_at").eq("id", p.box_set_id).maybeSingle() : { data: null };
    const { data: author } = project?.user_id ? await admin.from("profiles").select("display_name").eq("id", project.user_id).maybeSingle() : { data: null };
    // Listening position syncs to the account only when the buyer is the one signed in
    let viewerIsBuyer = false;
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const {
        data: { user },
      } = await (await createClient()).auth.getUser();
      viewerIsBuyer = Boolean(user && (user.id === p.buyer_user_id || (user.email || "").toLowerCase() === String(p.buyer_email || "").toLowerCase()));
    } catch {
      viewerIsBuyer = false;
    }
    // The rest of a bundle or an ebook + audiobook set bought in the same checkout
    const { data: others } = p.order_ref
      ? await admin.from("book_purchases").select("*").eq("order_ref", p.order_ref).neq("download_token", token).order("stripe_session_id")
      : { data: [] as Record<string, unknown>[] };
    const isAudio = p.format === "audiobook";
    let audio: { title: string; durationMs: number; url: string; download: string; fileName: string }[] = [];
    if (isAudio && p.status === "paid" && p.project_id) {
      const { audiobookFiles, signedFiles } = await import("@/lib/audiobook-sales");
      const files = ((await audiobookFiles(admin, p.project_id)) || []).filter((f) => !f.isSample);
      // Streaming plays straight from storage; downloads go through us to stamp the buyer's name into each file
      const listen = await signedFiles(files, p.project_id);
      audio = listen.map((f, i) => ({ title: f.title, durationMs: f.durationMs, url: f.url, download: `/purchase/${token}/mp3/${i + 1}`, fileName: f.fileName }));
    }
    const { readAlongAccess } = await import("@/lib/read-along");
    const readAlong = p.status === "paid" ? Boolean(await readAlongAccess(admin, token).catch(() => null)) : false;
    const { extrasForPurchase } = await import("@/lib/digital-extras");
    const extras = (await extrasForPurchase(admin, p).catch(() => [])).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      files: e.files.map((f, i) => ({ name: f.name, bytes: f.bytes, url: `/purchase/${token}/extra/${e.id}/${i + 1}` })),
    }));
    const waiting = Boolean(p.status === "paid" && p.preorder_release && !p.delivered_at);
    const releaseNow = (project?.release_date as string | null) || null;
    const isPaperback = p.format === "paperback";
    const cancellable =
      isPaperback && p.status === "paid" && Date.now() - Date.parse(p.created_at) < CANCEL_MINUTES * 60_000 && ["CREATED", "UNPAID", "PRODUCTION_DELAYED", "failed", null].includes(p.print_status ?? null);
    return {
      readAlong,
      extras,
      item:
        p.format === "item"
          ? { shipBy: (p.ship_by as string | null) || null, shippedAt: (p.shipped_at as string | null) || null, tracking: (p.tracking_url as string | null) || null, personalization: (p.personalization as string | null) || null }
          : null,
      paperback: isPaperback
        ? { status: (p.print_status as string | null) || null, trackingUrl: (p.tracking_url as string | null) || null, shippedAt: (p.shipped_at as string | null) || null, cancellable, proof: Boolean(p.is_proof) }
        : null,
      isExtra: p.format === "extra",
      isBoxSet: Boolean(p.box_set_id),
      preorder: waiting
        ? { promised: String(p.preorder_release), moved: Boolean(releaseNow && !project?.published && releaseNow > String(p.preorder_release)), newDate: releaseNow }
        : null,
      title: p.title as string,
      status: p.status as string,
      buyer_email: p.buyer_email as string,
      buyer_name: (p.buyer_name as string) || "",
      buyer_user_id: p.buyer_user_id as string | null,
      price_cents: p.price_cents as number,
      projectId: (p.project_id as string | null) || null,
      author: (author?.display_name as string) || "",
      viewerIsBuyer,
      isAudio,
      audio,
      coverUrl: boxSet?.cover_path
        ? coverPublicUrl(boxSet.cover_path, boxSet.updated_at ? Date.parse(boxSet.updated_at) : undefined)
        : project
          ? coverPublicUrl(projectCoverPath(project), project.updated_at ? Date.parse(project.updated_at) : undefined)
          : null,
      others: (others || []).map((o) => ({ title: o.title as string, download_token: o.download_token as string, isAudio: o.format === "audiobook", hasPage: ["audiobook", "extra", "item", "paperback"].includes(o.format as string) })),
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
            <p className="font-ui text-xs uppercase tracking-wide text-muted">
              {p.preorder ? "Your pre-order" : p.item ? "Your order" : p.paperback ? (p.paperback.proof ? "Your proof copy" : "Your paperback") : p.isAudio ? "Your audiobook" : p.isExtra ? "Your extra" : p.isBoxSet ? "Your box set" : "Your ebook"}
            </p>
            <h1 className="font-display mt-1 text-3xl">{p.title}</h1>
            {refunded ? (
              <p className="font-ui mt-4 text-sm text-muted">This purchase was refunded, so the download is no longer available.</p>
            ) : p.preorder ? (
              <>
                <p className="font-ui mt-3 text-sm">
                  It comes out on <strong>{longDay(p.preorder.promised)}</strong>. The day it&apos;s out, your ebook appears here and we email you.
                </p>
                {p.preorder.moved && p.preorder.newDate ? (
                  <p className="font-ui mt-2 border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
                    The author moved the release to <strong>{longDay(p.preorder.newDate)}</strong>. Keep your pre-order for the new date, or cancel for a full refund.
                    If you do nothing and it isn&apos;t out by {longDay(addDays(p.preorder.promised, PREORDER_GRACE_DAYS))}, you&apos;re refunded automatically.
                  </p>
                ) : (
                  <p className="font-ui mt-2 text-xs text-muted">
                    Cancel anytime before release for a full refund. If it&apos;s ever more than {PREORDER_GRACE_DAYS} days late, you&apos;re refunded automatically.
                  </p>
                )}
                <PreorderActions token={token} moved={p.preorder.moved} newDateLabel={p.preorder.newDate ? longDay(p.preorder.newDate) : null} />
              </>
            ) : p.item ? (
              <>
                <p className="font-ui mt-3 text-sm">
                  {p.item.shippedAt
                    ? `The author shipped it on ${new Date(p.item.shippedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
                    : `The author ships it themselves${p.item.shipBy ? `, by ${longDay(p.item.shipBy)}` : ""}. You'll get an email with tracking when it's on its way.`}
                </p>
                {p.item.personalization && <p className="font-ui mt-2 text-sm">Dedication: “{p.item.personalization}”</p>}
                {p.item.tracking &&
                  (p.item.tracking.startsWith("http") ? (
                    <a href={p.item.tracking} target="_blank" rel="noopener noreferrer" className="font-ui mt-3 inline-block bg-accent px-5 py-2.5 text-paper">
                      Track your package
                    </a>
                  ) : (
                    <p className="font-ui mt-2 text-sm">Tracking: {p.item.tracking}</p>
                  ))}
                <p className="font-ui mt-3 text-xs text-muted">If it arrives damaged or never arrives, reply to your order email and the author will replace or refund it.</p>
              </>
            ) : p.paperback ? (
              <>
                <p className="font-ui mt-3 text-sm">{printLine(p.paperback.status, p.paperback.shippedAt)}</p>
                {p.paperback.trackingUrl && (
                  <a href={p.paperback.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-ui mt-3 inline-block bg-accent px-5 py-2.5 text-paper">
                    Track your package
                  </a>
                )}
                {p.paperback.cancellable && <PaperbackCancel token={token} />}
                <p className="font-ui mt-3 text-xs text-muted">
                  Printed on demand by Lulu, so it can&apos;t be returned, but a misprinted, damaged, or lost book is replaced: reply to your receipt email with a photo within 30 days.
                </p>
              </>
            ) : p.isExtra ? (
              <p className="font-ui mt-3 text-sm text-muted">Download your files below. They&apos;re yours to keep, and this page keeps working whenever you need them again.</p>
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
        {!refunded && p.readAlong && (
          <a href={`/purchase/${token}/read`} className="font-ui mt-6 block border border-accent px-4 py-3 text-sm">
            <span className="font-medium text-accent">Read and listen</span>
            <span className="block text-xs text-muted">You have the ebook and the audiobook: read the book here and switch to listening at the same spot.</span>
          </a>
        )}
        {!refunded && p.isAudio && p.audio.length > 0 && (
          <section className="mt-8">
            <AudiobookPlayer
              projectId={p.projectId!}
              storageKey={token}
              files={p.audio.map((f) => ({ title: f.title, url: f.url, durationMs: f.durationMs }))}
              signedIn={p.viewerIsBuyer}
              title={p.title}
              author={p.author}
              coverUrl={p.coverUrl}
            />
            <details className="font-ui mt-4 text-sm">
              <summary className="cursor-pointer text-accent">Download the MP3 files</summary>
              <ol className="mt-2 space-y-1 text-xs">
                {p.audio.map((f, i) => (
                  <li key={f.fileName}>
                    <a href={f.download} className="text-accent underline">
                      {i + 1}. {f.title}
                    </a>{" "}
                    <span className="text-muted">({Math.round(f.durationMs / 60000)} min)</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-muted">No copy protection: they play in any app. Each file carries the book&apos;s details and a note that it&apos;s your copy.</p>
            </details>
          </section>
        )}
        {!refunded && p.extras.length > 0 && (
          <section className="font-ui mt-8 border-t border-line pt-4 text-sm">
            <h2 className="font-display text-xl">{p.isExtra ? "Your files" : "Extras included with your ebook"}</h2>
            <ul className="mt-3 space-y-4">
              {p.extras.map((e) => (
                <li key={e.id}>
                  {!p.isExtra && <p className="text-ink">{e.title}</p>}
                  {!p.isExtra && e.description && <p className="text-xs text-muted">{e.description}</p>}
                  <ul className="mt-1 space-y-1 text-xs">
                    {e.files.map((f) => (
                      <li key={f.url}>
                        <a href={f.url} className="text-accent underline">
                          {f.name}
                        </a>{" "}
                        <span className="text-muted">({Math.max(1, Math.round(f.bytes / 1024 / 1024))} MB)</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!refunded && p.others.length > 0 && (
          <section className="font-ui mt-8 border-t border-line pt-4 text-sm">
            <h2 className="font-display text-xl">Also in this order</h2>
            <ul className="mt-2 space-y-2">
              {p.others.map((o) => (
                <li key={o.download_token} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-base">{o.title}</span>
                  <a href={o.hasPage ? `/purchase/${o.download_token}` : `/purchase/${o.download_token}/epub`} className="border border-accent px-3 py-1 text-xs text-accent">
                    {o.isAudio ? "Listen and download" : o.hasPage ? "Open" : "Download the EPUB"}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!refunded && !p.isAudio && !p.isExtra && !p.preorder && !p.paperback && !p.item && (
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
        {!refunded && p.viewerIsBuyer && p.projectId && !p.isExtra && !p.isBoxSet && !p.preorder && !p.paperback?.proof && (
          <div className="mt-10">
            <ReviewForm projectId={p.projectId} />
          </div>
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

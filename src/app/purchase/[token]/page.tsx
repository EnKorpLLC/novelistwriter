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
    const { data: p } = await admin.from("book_purchases").select("title, status, buyer_email, buyer_user_id, project_id, created_at, price_cents").eq("download_token", token).maybeSingle();
    if (!p) return null;
    const { data: project } = p.project_id ? await admin.from("projects").select("cover_path, metadata, updated_at").eq("id", p.project_id).maybeSingle() : { data: null };
    // The rest of a bundle bought in the same checkout (before migration_direct_sales_3.sql there's no order_ref)
    const { data: ref } = await admin.from("book_purchases").select("order_ref").eq("download_token", token).maybeSingle();
    const { data: others } = ref?.order_ref
      ? await admin.from("book_purchases").select("title, download_token").eq("order_ref", ref.order_ref).neq("download_token", token).order("stripe_session_id")
      : { data: [] as { title: string; download_token: string }[] };
    return {
      ...p,
      coverUrl: project ? coverPublicUrl(projectCoverPath(project), project.updated_at ? Date.parse(project.updated_at) : undefined) : null,
      others: (others || []) as { title: string; download_token: string }[],
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
            <p className="font-ui text-xs uppercase tracking-wide text-muted">Your ebook</p>
            <h1 className="font-display mt-1 text-3xl">{p.title}</h1>
            {refunded ? (
              <p className="font-ui mt-4 text-sm text-muted">This purchase was refunded, so the download is no longer available.</p>
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
        {!refunded && p.others.length > 0 && (
          <section className="font-ui mt-8 border-t border-line pt-4 text-sm">
            <h2 className="font-display text-xl">Also in this order</h2>
            <ul className="mt-2 space-y-2">
              {p.others.map((o) => (
                <li key={o.download_token} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-base">{o.title}</span>
                  <a href={`/purchase/${o.download_token}/epub`} className="border border-accent px-3 py-1 text-xs text-accent">
                    Download the EPUB
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!refunded && (
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

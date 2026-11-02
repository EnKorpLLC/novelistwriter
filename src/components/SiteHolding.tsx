import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PreviewBar } from "@/components/OwnerBar";

/** What visitors see when an author's site and launch pages aren't public (Free plan). */
export function SiteHolding({ authorName, previewBackHref }: { authorName: string; previewBackHref?: string | null }) {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      {previewBackHref && <PreviewBar backHref={previewBackHref} />}
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Novelist Writer</p>
        <h1 className="font-display mt-4 text-4xl text-ink">{authorName}</h1>
        <p className="mt-4 text-muted">This page isn&apos;t public right now.</p>
        <div className="font-ui mt-10 flex flex-wrap justify-center gap-3 text-sm">
          <Link href="/books" className="bg-accent px-5 py-2.5 text-paper">
            Browse published books
          </Link>
          <Link href="/readers" className="border border-line px-5 py-2.5 text-accent">
            Read books before release
          </Link>
          <Link href="/authors" className="border border-line px-5 py-2.5 text-accent">
            Write with Novelist Writer
          </Link>
        </div>
      </main>
    </div>
  );
}

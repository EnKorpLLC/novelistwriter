import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { appUrl } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Verify a book's writing record | Novelist Writer",
  description:
    "Enter a Novelist Writer verification code (NW-XXXX-XXXX) to see how a book was written: typed versus pasted, sessions over time, and AI use. Free badge and API for any platform.",
  alternates: { canonical: "/verify" },
};

export const dynamic = "force-dynamic";

/** Look up a code from a paperback, an Amazon description, or anywhere links don't work. Plus the free platform API. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code: raw } = await searchParams;
  let notFoundCode = false;
  if (raw) {
    const { parseVerifyCode } = await import("@/lib/verify");
    const code = parseVerifyCode(raw);
    if (code) redirect(`/verify/${code}`);
    notFoundCode = true;
  }
  const example = appUrl("/api/verify/ABCD2345");

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-4xl">Verify how a book was written</h1>
        <p className="mt-3 text-lg">
          Books written in Novelist Writer can carry a verification code. Enter it to see the book&apos;s writing record: how much was typed versus
          pasted, how many sessions over how many weeks, and whether any AI tool was used. Never the text itself.
        </p>
        <form action="/verify" method="get" className="font-ui mt-6 flex flex-wrap gap-2">
          <label htmlFor="code" className="sr-only">
            Verification code
          </label>
          <input id="code" name="code" defaultValue={raw || ""} placeholder="NW-XXXX-XXXX" className="min-w-64 flex-1 border border-line bg-paper px-3 py-2 uppercase" />
          <button type="submit" className="bg-accent px-5 py-2 text-paper">
            Check
          </button>
        </form>
        {notFoundCode && <p className="font-ui mt-2 text-sm text-danger">That doesn&apos;t look like a verification code. Codes look like NW-ABCD-2345.</p>}

        <section className="mt-12">
          <h2 className="font-display text-2xl">What the badge means</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong>Verified human-written:</strong> the book meets the “Written in Novelist Writer” standard (typed in our editor across many sessions
              and weeks) and no AI tool was ever run on it.
            </li>
            <li>
              <strong>Written in Novelist Writer:</strong> meets the writing standard, but the author used AI critique tools on it. Our AI gives feedback;
              it never writes.
            </li>
            <li>
              <strong>Writing record:</strong> the book doesn&apos;t meet the standard yet (for example it was imported, or is still early), so the badge
              shows the share that was typed here.
            </li>
          </ul>
          <p className="mt-3">
            <Link href="/human-authorship-standard" className="text-accent underline">
              Read the full standard
            </Link>
          </p>
        </section>

        <section id="platforms" className="mt-12">
          <h2 className="font-display text-2xl">For platforms: free, no key needed</h2>
          <p className="mt-2">
            Royal Road, Wattpad, Substack, serial sites, bookstores, and review sites can show or check the badge themselves. It costs nothing and needs
            no sign-up. Authors choose which books answer; codes for books with verification off return “not verified”.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong>JSON:</strong> <code className="text-sm">GET {example}</code> returns the status, the badge label, the record summary (typed,
              pasted, imported, sessions, days, dates), and links. Open to any site (CORS), cached for an hour.
            </li>
            <li>
              <strong>Badge image:</strong> <code className="text-sm">/verify/CODE/badge.svg</code>, or <code className="text-sm">?theme=dark</code>.
              It always shows the current state.
            </li>
            <li>
              <strong>Page:</strong> <code className="text-sm">/verify/CODE</code> is the human-readable record to link to.
            </li>
          </ul>
          <p className="mt-3">
            Want to work together on fighting AI spam?{" "}
            <Link href="/contact" className="text-accent underline">
              Get in touch
            </Link>
            .
          </p>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl">For authors</h2>
          <p className="mt-2">
            Every plan, including Free, can turn on a verification badge for any book from its Launch tab, then paste it on Royal Road, Wattpad, Substack,
            your Amazon description, or your own site.{" "}
            <Link href="/authors" className="text-accent underline">
              Start writing free
            </Link>
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

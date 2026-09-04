import Link from "next/link";
import { SUB_ALLOWANCE } from "@/lib/types";

export default function PricingPage() {
  return (
    <div className="min-h-screen px-6 py-16 md:px-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="font-ui text-sm text-accent">
          ← Home
        </Link>
        <h1 className="font-display mt-8 text-4xl">Pricing</h1>
        <p className="mt-3 max-w-xl text-muted">
          Write free forever. First project free. Pay for extra projects and AI — or subscribe.
          AI critiques craft; it never writes your novel.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="border border-line bg-paper p-6">
            <h2 className="font-display text-2xl">Pay as you go</h2>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li>Core studio — $0 forever</li>
              <li>1st project — free</li>
              <li>Extra projects — $9 one-time each</li>
              <li>AI credit packs from $5</li>
              <li>Price shown before every AI run</li>
            </ul>
          </div>
          <div className="border border-accent bg-paper p-6">
            <h2 className="font-display text-2xl">Optional subscription</h2>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li>
                <strong className="text-ink">Pro</strong> — $16/mo — unlimited projects +{" "}
                {SUB_ALLOWANCE.pro} monthly AI credits (all critique actions)
              </li>
              <li>
                <strong className="text-ink">Studio</strong> — $32/mo — {SUB_ALLOWANCE.studio}{" "}
                monthly credits, plus:
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Beta reader desk (forms, auto-approve, progress, highlight comments)</li>
                  <li>Series tools</li>
                  <li>Bring your own API key (BYOK)</li>
                  <li>Priority AI jobs</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>

        <p className="font-ui mt-8 max-w-2xl text-sm text-muted">
          Curious about beta? See how the reader workflow works on the{" "}
          <Link href="/#beta" className="text-accent underline-offset-2 hover:underline">
            homepage
          </Link>
          .
        </p>

        <Link
          href="/signup"
          className="font-ui mt-10 inline-block rounded-sm bg-accent px-6 py-3 text-paper hover:bg-accent-soft"
        >
          Start free
        </Link>
      </div>
    </div>
  );
}

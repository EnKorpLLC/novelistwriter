import Link from "next/link";

/** Ends every free tool and guide: the honest next step. */
export function WriteHereCta({ line = "Write your book here, prove you wrote it, and take it all the way to launch." }: { line?: string }) {
  return (
    <section className="mt-14 border border-accent/40 bg-accent/5 p-6">
      <h2 className="font-display text-2xl">Write your book here</h2>
      <p className="mt-2 max-w-2xl text-muted">{line}</p>
      <div className="font-ui mt-4 flex flex-wrap gap-3">
        <Link href="/signup" className="bg-ink px-5 py-2.5 text-paper hover:bg-accent">
          Start writing free
        </Link>
        <Link href="/pricing" className="border border-ink/20 px-5 py-2.5 text-ink hover:border-accent hover:text-accent">
          See plans
        </Link>
      </div>
    </section>
  );
}

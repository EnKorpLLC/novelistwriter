import type { BookFacts as Facts } from "@/lib/book-facts";

/** Genres, tropes, and content warnings, so readers know what they're agreeing to read. */
export function BookFacts({ facts, className = "" }: { facts?: Facts | null; className?: string }) {
  if (!facts) return null;
  const hasWarnings = facts.warnings.length > 0 || Boolean(facts.writtenWarnings);
  return (
    <div className={`font-ui space-y-2 text-xs ${className}`}>
      {facts.genres.length > 0 && (
        <p>
          <span className="text-muted">Genre: </span>
          <span className="text-ink">{facts.genres.join(" · ")}</span>
        </p>
      )}
      {facts.tropes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted">Tropes:</span>
          {facts.tropes.map((t) => (
            <span key={t} className="border border-line px-2 py-0.5 text-ink">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="border border-warn/40 bg-warn/10 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-muted">Content warnings</p>
        {hasWarnings ? (
          <>
            {facts.warnings.length > 0 && <p className="mt-1 text-ink">{facts.warnings.join(" · ")}</p>}
            {facts.writtenWarnings && <p className="mt-1 whitespace-pre-wrap text-ink">{facts.writtenWarnings}</p>}
          </>
        ) : (
          <p className="mt-1 text-muted">The author hasn&apos;t listed any.</p>
        )}
      </div>
    </div>
  );
}

/** The same details behind a "Book details" toggle, for the reading header. */
export function BookFactsToggle({ facts, open = false }: { facts?: Facts | null; open?: boolean }) {
  if (!facts) return null;
  return (
    <details open={open} className="font-ui text-xs">
      <summary className="cursor-pointer text-accent">Book details: genre, tropes, and content warnings</summary>
      <BookFacts facts={facts} className="mt-2" />
    </details>
  );
}

import Link from "next/link";
import type { SpotlightBook } from "@/lib/spotlight";

function when(b: SpotlightBook) {
  if (b.out) return "Out now";
  if (!b.releaseDate) return "Coming soon";
  return `Out ${new Date(`${b.releaseDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

/** L3: the "Launching this week" row on the catalog and home page. Renders nothing when no one is launching. */
export function LaunchingThisWeek({ books, heading = "Launching this week" }: { books: SpotlightBook[]; heading?: string }) {
  if (!books.length) return null;
  return (
    <section>
      <h2 className="font-display text-2xl">{heading}</h2>
      <p className="font-ui mt-1 text-xs text-muted">New releases from Novelist Writer authors, every one with a record of how it was written.</p>
      <ul className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
        {books.map((b) => (
          <li key={b.id}>
            <Link href={b.href} className="group block">
              <div className="aspect-[2/3] overflow-hidden border border-line bg-paper-deep">
                {b.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.coverUrl} alt="" className="h-full w-full object-cover transition group-hover:opacity-90" />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-center font-display text-lg text-muted">{b.title}</div>
                )}
              </div>
              <p className="font-ui mt-2 text-[10px] uppercase tracking-wide text-accent">{when(b)}</p>
              <p className="font-display text-lg leading-tight group-hover:text-accent">{b.title}</p>
              <p className="font-ui text-xs text-muted">
                {b.authorName} · {b.genre}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

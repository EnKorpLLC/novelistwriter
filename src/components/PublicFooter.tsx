import Link from "next/link";

/** Grouped so 20-odd links read as navigation, two columns on phones and four on wider screens. */
const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Books",
    links: [
      { href: "/books", label: "Published books" },
      { href: "/genres", label: "Genres" },
      { href: "/promos", label: "Book promotions" },
      { href: "/challenges", label: "Challenges" },
    ],
  },
  {
    title: "For authors",
    links: [
      { href: "/authors", label: "What authors get" },
      { href: "/pricing", label: "Pricing" },
      { href: "/tools", label: "Free tools" },
      { href: "/guides", label: "Guides" },
      { href: "/compare", label: "Compare" },
      { href: "/works-with", label: "Works with" },
      { href: "/affiliates", label: "Affiliates" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/readers", label: "For readers" },
      { href: "/human-authorship-standard", label: "How we verify" },
      { href: "/verify", label: "Verify a book" },
      { href: "/reports", label: "Reports" },
      { href: "/conduct", label: "Conduct" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/your-data", label: "Your data" },
      { href: "/refunds", label: "Refunds" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

/** Follow links appear once each account exists and its URL is set in the environment */
const SOCIAL = [
  { href: process.env.NEXT_PUBLIC_SOCIAL_BLUESKY, label: "Bluesky" },
  { href: process.env.NEXT_PUBLIC_SOCIAL_MASTODON, label: "Mastodon" },
  { href: process.env.NEXT_PUBLIC_SOCIAL_THREADS, label: "Threads" },
  { href: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM, label: "Instagram" },
  { href: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK, label: "TikTok" },
  { href: process.env.NEXT_PUBLIC_SOCIAL_X, label: "X" },
].filter((s): s is { href: string; label: string } => Boolean(s.href));

/** Site footer. On authors' own pages it reads as a small "made with" credit instead. */
export function PublicFooter({ credit }: { credit?: "author-site" | "launch-page" }) {
  if (credit) {
    return (
      <footer className="font-ui border-t border-line px-6 py-6 text-center text-xs text-muted">
        {credit === "author-site" ? "Author site" : "Launch page"} made with{" "}
        <Link href={`/?utm_source=made_with&utm_medium=${credit}`} className="text-accent hover:underline">
          Novelist Writer
        </Link>
        , where authors prove they wrote their books.
      </footer>
    );
  }
  return (
    <footer className="font-ui border-t border-line px-6 py-10 text-sm text-muted md:px-10">
      <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-[1fr_3fr]">
        <div>
          <Link href="/" className="font-display text-lg text-ink">
            Novelist Writer
          </Link>
          <p className="mt-1 max-w-xs text-xs">Write it yourself. Prove it.</p>
          {SOCIAL.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-3 text-xs">
              {SOCIAL.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer me" className="hover:text-ink">
                  {s.label}
                </a>
              ))}
            </p>
          )}
        </div>
        <nav aria-label="Site" className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="text-[11px] uppercase tracking-wide text-ink">{c.title}</p>
              <ul className="mt-2 space-y-1.5">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}

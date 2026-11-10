import Link from "next/link";

const LINKS = [
  { href: "/books", label: "Published books" },
  { href: "/promos", label: "Book promotions" },
  { href: "/authors", label: "For authors" },
  { href: "/readers", label: "For readers" },
  { href: "/challenges", label: "Challenges" },
  { href: "/tools", label: "Free tools" },
  { href: "/guides", label: "Guides" },
  { href: "/reports", label: "Reports" },
  { href: "/genres", label: "Genres" },
  { href: "/human-authorship-standard", label: "How we verify" },
  { href: "/verify", label: "Verify a book" },
  { href: "/conduct", label: "Conduct" },
  { href: "/compare", label: "Compare" },
  { href: "/works-with", label: "Works with" },
  { href: "/pricing", label: "Pricing" },
  { href: "/affiliates", label: "Affiliates" },
  { href: "/your-data", label: "Your data" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
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
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
        <Link href="/" className="font-display text-ink">
          Novelist Writer
        </Link>
        <nav className="flex flex-wrap gap-4">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      {SOCIAL.length > 0 && (
        <div className="mx-auto mt-4 flex max-w-5xl flex-wrap gap-4 text-xs">
          <span>Follow us:</span>
          {SOCIAL.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer me" className="hover:text-ink">
              {s.label}
            </a>
          ))}
        </div>
      )}
    </footer>
  );
}

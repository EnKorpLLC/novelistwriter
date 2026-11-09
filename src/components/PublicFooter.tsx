import Link from "next/link";

const LINKS = [
  { href: "/books", label: "Published books" },
  { href: "/promos", label: "Book promotions" },
  { href: "/authors", label: "For authors" },
  { href: "/readers", label: "For readers" },
  { href: "/challenges", label: "Challenges" },
  { href: "/tools", label: "Free tools" },
  { href: "/compare", label: "Compare" },
  { href: "/pricing", label: "Pricing" },
  { href: "/affiliates", label: "Affiliates" },
  { href: "/your-data", label: "Your data" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
];

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
    </footer>
  );
}

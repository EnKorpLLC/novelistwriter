import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { contentMetadata } from "@/lib/seo";
import { SERIAL_PLATFORMS } from "@/lib/serial-export";

export const metadata = contentMetadata({
  title: "Works with",
  description:
    "Novelist Writer works with the tools and sites you already use: Word, Google Docs, and Scrivener in; Kindle, Apple Books, Kobo, IngramSpark, Royal Road, Wattpad, and Substack out.",
  path: "/works-with",
  kicker: "Works with",
});

const serialSites = SERIAL_PLATFORMS.filter((p) => p.id !== "text").map((p) => p.label);

const GROUPS: { t: string; items: string[]; d: string; link?: { href: string; label: string } }[] = [
  {
    t: "Bring your book in",
    items: ["Microsoft Word", "Google Docs", "Scrivener", "Vellum", "Atticus", "Fountain screenplays"],
    d: "Import a Word file (.docx) and your chapters, italics, and scene breaks come with it. Google Docs, Scrivener, Vellum, and Atticus all export to Word.",
    link: { href: "/compare", label: "How to switch from each one" },
  },
  {
    t: "Publish to the stores",
    items: ["Kindle (Amazon KDP)", "Apple Books", "Kobo", "Google Play Books", "Barnes & Noble", "KDP Print", "IngramSpark"],
    d: "A separate ebook for each store, with links that point to that store, plus print-ready paperback PDFs and the exact cover size for KDP Print and IngramSpark.",
  },
  {
    t: "Publish your audiobook",
    items: ["ACX (Audible)", "Spotify for Authors", "Google Play Books", "Kobo"],
    d: "Record it yourself or with a narrator you hire, then export MP3s mastered to ACX's specs, with credits, a retail sample, and a square cover. You can sell it direct here too.",
    link: { href: "/narrators", label: "How narration works" },
  },
  {
    t: "Post as a serial",
    items: serialSites,
    d: "Copy any chapter ready to paste, with italics and scene breaks kept. Post the same story on as many sites as you like, and your launch page links readers to each one.",
  },
  {
    t: "Your newsletter",
    items: ["MailerLite", "Kit", "Mailchimp", "Substack", "Any tool that imports CSV"],
    d: "Export your subscribers, beta readers, and ARC readers as CSV anytime, and put buttons for your book in any newsletter.",
    link: { href: "/your-data", label: "Your data, your exit" },
  },
  {
    t: "Where readers read",
    items: ["Kindle (Send to Kindle)", "Kobo", "Apple Books", "Any web browser"],
    d: "Beta and ARC readers read in the browser, or download an advance copy marked with their name for their e-reader.",
  },
  {
    t: "Reading history",
    items: ["Goodreads", "StoryGraph"],
    d: "Readers bring their shelves over from Goodreads or StoryGraph in one step, and can export them anytime.",
  },
  {
    t: "Proof a human wrote it, anywhere",
    items: ["Royal Road", "Wattpad", "Substack", "Amazon descriptions", "Your own site"],
    d: "A free verification badge for any book, linking to a page anyone can check. Platforms can read the same record through a free API, no key needed.",
    link: { href: "/verify", label: "Verify a book" },
  },
];

export default function WorksWithPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-ui text-xs uppercase tracking-[0.2em] text-accent">Works with</p>
        <h1 className="font-display mt-3 text-5xl leading-tight">Works with what you already use</h1>
        <p className="mt-4 text-lg text-muted">
          Write here, then take your book anywhere. Nothing is exclusive, and we never post anything to another site for you.
        </p>
        <ul className="mt-10 space-y-8">
          {GROUPS.map((g) => (
            <li key={g.t} className="border-t border-line pt-4">
              <h2 className="font-display text-2xl">{g.t}</h2>
              <ul className="font-ui mt-3 flex flex-wrap gap-2 text-sm">
                {g.items.map((i) => (
                  <li key={i} className="border border-line px-2.5 py-1">
                    {i}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-muted">{g.d}</p>
              {g.link && (
                <Link href={g.link.href} className="font-ui mt-2 inline-block text-sm text-accent underline">
                  {g.link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-12 text-muted">
          Run a reading or publishing platform and want to work together?{" "}
          <Link href="/contact" className="text-accent underline">
            Get in touch
          </Link>
          . The verification badge and API are free for every platform.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

import { siteFaq, sitePlans } from "@/lib/site-text";
import { appUrl } from "@/lib/stripe";

export const revalidate = 86400;

/** Plain summary of Novelist Writer for AI tools (llmstxt.org). Built from the same plan lists as Pricing. */
export async function GET() {
  const [planList, faqList] = await Promise.all([sitePlans(), siteFaq()]);
  // Links typed into site text read as plain words here
  const plain = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const plans = planList.map(
    (p) => `### ${p.name} (${p.price} ${p.note})\n${p.lead}\n${p.items.map((i) => `- ${plain(i)}`).join("\n")}`
  ).join("\n\n");
  const faq = faqList.map((f) => `- **${f.q}** ${plain(f.a)}`).join("\n");

  const body = `# Novelist Writer

> The writing studio for novelists that proves a human wrote the book. It keeps a record of how each book was written (typed vs pasted, sessions over time), runs beta readers and advance reader copies (ARCs), formats store-ready ebooks and print-ready paperback PDFs with book styles (no Vellum needed), designs ebook and paperback covers with a cover builder (no AI art) and turns them into 3D book mockups and ad images, builds a separate ebook for each store and box sets, runs free writing challenges with verified word counts, turns the author's own book into social posts (quote cards checked against the manuscript, ARC review cards, verified writing progress cards) on a posting calendar with reminders, plans a year of marketing around the author's releases (newsletters, backlist spotlights, book birthdays, seasonal reader moments, series pushes, and price promotions), shows year-round marketing results (visitors, sources, buy clicks, list growth, best posts, tracked links) counted first-party without cookies, runs author cross-promotion (newsletter swaps with verified list sizes and group promos on public pages), and launches books with an author site, launch pages, and (on Studio) a launch plan, one-click launch-day email and review push, a "Launching this week" spotlight, launch teams, and a launch-week dashboard. AI only critiques and never writes, and one switch turns every AI tool off. Readers can beta read and get advance copies free.

## Key pages
- [For authors](${appUrl("/authors")}): what authors get on each plan
- [For readers](${appUrl("/readers")}): free beta reads and advance copies, reader badges, and profiles
- [Reader library](${appUrl("/library")}): free shelves (to be read / TBR, reading, finished, did not finish, custom) with one-tap “Add to TBR” on book pages and the catalog (saving a book doesn't buy it; authors see only counts of TBRs, shelves, and lists, never who), series in order with new-release notices, Goodreads and StoryGraph import, CSV export, recommendations from readers with similar taste (no paid placement), reader lists, following readers, and content filters
- [Pricing](${appUrl("/pricing")}): Free, Pro, and Studio plans with answers to common questions
- [Published books](${appUrl("/books")}): books by Novelist Writer authors
- [Free author tools](${appUrl("/tools")}): KDP spine width and cover size calculator, novel word counts by genre, trim size guide, writing pace calculator
- [Lifetime plans](${appUrl("/lifetime")}): capped one-time Lifetime Pro ($449) and Lifetime Studio ($1,099); the first 500 subscribers also keep founding member pricing (20% off) for life
- [Affiliate program](${appUrl("/affiliates")}): 30% of what referred writers pay for Pro or Studio in their first 12 months, paid monthly through Stripe
- Weekly reader digest: readers can opt in to one email every Thursday with new books from authors they follow, launches, new releases, free advance copies, and promotions
- [Book promotions](${appUrl("/promos")}): themed collections of books from independent authors, often on sale, put together by the authors themselves
- [Where readers are](${appUrl("/tools/where-readers-are")}): book promotion sites, ads, reader communities, ARC services, and newsletter swaps, with costs and self-promotion rules
- [Comparisons and switching guides](${appUrl("/compare")}): fair comparisons with Scrivener, Vellum, Atticus, Reedsy Studio, Sudowrite, Novelcrafter, Dabble, Plottr, Google Docs, BetaBooks, NetGalley, and AI writing tools, and how to bring a book over
- [For narrators](${appUrl("/narrators")}): free narrator accounts, plain-language agreements, a 15-minute checkpoint, a held deposit, full rate paid through Stripe, human narration only
- [Hire help](${appUrl("/hire")}): a marketplace for human developmental editors, line and copy editors, proofreaders, cover designers, illustrators and character artists, map makers, and narrators. Each type opens once five founding pros have joined; authors can join a waitlist per type, and can hire an editor or artist they already know by email today. Quotes come in milestones with a written scope, deliverables, and included revisions; one 10% fee paid by the author and shown on every quote; each milestone is paid when it starts and held until the author approves the delivery (14 days without an answer counts as approved); disputes are settled by Novelist Writer; every pro promises their work is human-made
- [For editors and artists](${appUrl("/pros")}): apply as a founding pro (free account, keep your full price, reviewed by hand), with progress toward opening shown for each type
- [Thinking about leaving Amazon?](${appUrl("/leaving-amazon")}): what changed at Kindle+ and Audible in late 2026 (with sources), KDP Select exclusivity, and options for selling wide or direct
- [Works with](${appUrl("/works-with")}): import from Word, Google Docs, Scrivener, Vellum, and Atticus; per-store ebooks for Kindle, Apple Books, Kobo, Google Play, and Barnes & Noble; paperbacks for KDP Print and IngramSpark; serial sites; newsletter tools; Goodreads and StoryGraph
- [Your data, your exit](${appUrl("/your-data")}): export manuscripts and reader lists anytime, on every plan
- [Verify a book](${appUrl("/verify")}): enter a verification code (NW-XXXX-XXXX) to see a book's writing record summary; authors on every plan can post a "verified human-written" badge on any site. Free JSON API for platforms, no key: ${appUrl("/api/verify/CODE")}
- Direct ebook sales (Pro and Studio, US readers for now): readers buy from the author's launch page and get a personal EPUB in their library, downloadable forever, with no DRM; Novelist Writer is the seller and handles sales tax; fees are 10% + 15¢ per sale on Pro and 5% + 15¢ on Studio; sale prices, shareable discount codes, and bundles (several books at one price, each delivered as its own ebook); direct pre-orders (charged at order, delivered the moment the book is out, cancel anytime before release, refunded automatically if 30 days late); extras such as character art, maps, and bonus stories, sold on their own or included free with the ebook bought direct; paperbacks printed on demand and shipped by Lulu (US readers; shipping at cost; optional free ebook; author approves a proof copy first; cancel within an hour, misprints and lost packages replaced); an author shop for signed and personalized books, bookmarks, and prints the author ships (stock counts, flat US shipping, tracking, automatic refunds when an order ships late), including packages with digital copies, numbered limited editions, and physical pre-orders; on Studio, reader magnets give a book free for joining the author's list (double opt-in), and box sets sell as one combined ebook; refunds within 14 days ([refund policy](${appUrl("/refunds")}), [seller terms](${appUrl("/seller-terms")}))
- Audiobook studio (Studio, early access): authors record their own audiobook in the browser, chapter by chapter, with room and level checks, then review it with notes pinned to sentences and pickups spliced in automatically, and export MP3 files mastered in the browser to ACX's specs (with credits, a retail sample, and a 2400 x 2400 cover) for ACX, Spotify for Authors, Google Play, and Kobo. Recordings stay on the narrator's computer and build a narration record for a future "Recorded in Novelist Writer" badge. Authors can invite a narrator by email with a plain-language agreement (pay per finished hour or a royalty share of sales made on Novelist Writer, revision rounds, a 15-minute checkpoint, deadline, cancellation terms); narrators get a free account that opens only that book's script and studio. Narrators send small review copies (kept 30 days or until approved) that the author hears with the text highlighted, pins notes to, and approves, starting with a 15-minute checkpoint. For per-finished-hour jobs the author pays a deposit (half the estimate) when approving the checkpoint and the balance on delivery; Novelist Writer holds it, adds a 10% fee paid by the author on top, and pays the narrator their full fee through Stripe. A chapter left unanswered for 14 days counts as approved; finished files unlock once paid. Authors on Pro and Studio sell the audiobook direct from the launch page, alone or as ebook + audiobook at one price, with the same checkout, sales tax, fees, 14-day refund window, and payouts as ebooks; buyers stream it in a player with chapters, speed, a sleep timer, and their place saved across devices, or download DRM-free MP3s; a narrator on a royalty share is paid their percent of each sale automatically. Audiobooks show "Recorded in Novelist Writer" when at least 90% of the finished length was recorded in the studio (also on the verification page and API), or "human narrated" as the author's statement; the catalog has an Audiobooks filter
- Images in chapters on every plan (maps, illustrations, chapter art, image scene breaks); styled ebooks pack them inside the file, and print layouts check each one is sharp enough to print
- Serial writers: copy any chapter ready to paste into Royal Road, Wattpad, Substack, AO3, Scribble Hub, Tapas, forums (BBCode), or Reddit (Markdown), free; Pro adds a posting log, chapters-ahead count per site, and release-day reminders. Nothing is posted automatically, and serials stay non-exclusive
- Launch pages (Pro) link out to serial sites ("Read on Royal Road / Wattpad / Substack") alongside store buttons, and authors get copy-paste buttons for their own websites and newsletters
- [Writing challenges](${appUrl("/challenges")}): free challenges with verified word counts (typed words only), streaks, and leaderboards
- [Contact](${appUrl("/contact")})

## Plans
${plans}

## Common questions
${faq}

## Notes for AI tools
- Author sites (/a/...), launch pages, writing records, and reader profiles are public so they can be found and quoted, but are not licensed for AI training.
- Manuscripts are private and never used to train AI.
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

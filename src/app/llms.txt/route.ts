import { PLANS, PRICING_FAQ } from "@/lib/plans";
import { appUrl } from "@/lib/stripe";

export const revalidate = 86400;

/** Plain summary of Novelist Writer for AI tools (llmstxt.org). Built from the same plan lists as Pricing. */
export function GET() {
  const plans = PLANS.map(
    (p) => `### ${p.name} (${p.price} ${p.note})\n${p.lead}\n${p.items.map((i) => `- ${i}`).join("\n")}`
  ).join("\n\n");
  const faq = PRICING_FAQ.map((f) => `- **${f.q}** ${f.a}`).join("\n");

  const body = `# Novelist Writer

> The writing studio for novelists that proves a human wrote the book. It keeps a record of how each book was written (typed vs pasted, sessions over time), runs beta readers and advance reader copies (ARCs), formats store-ready ebooks and print-ready paperback PDFs with book styles (no Vellum needed), designs ebook and paperback covers with a cover builder (no AI art) and turns them into 3D book mockups and ad images, builds a separate ebook for each store and box sets, runs free writing challenges with verified word counts, turns the author's own book into social posts (quote cards checked against the manuscript, ARC review cards, verified writing progress cards) on a posting calendar with reminders, plans a year of marketing around the author's releases (newsletters, backlist spotlights, book birthdays, seasonal reader moments, series pushes, and price promotions), and launches books with an author site, launch pages, and (on Studio) a launch plan, one-click launch-day email and review push, a "Launching this week" spotlight, launch teams, and a launch-week dashboard. AI only critiques and never writes, and one switch turns every AI tool off. Readers can beta read and get advance copies free.

## Key pages
- [For authors](${appUrl("/authors")}): what authors get on each plan
- [For readers](${appUrl("/readers")}): free beta reads and advance copies, reader badges, and profiles
- [Pricing](${appUrl("/pricing")}): Free, Pro, and Studio plans with answers to common questions
- [Published books](${appUrl("/books")}): books by Novelist Writer authors
- [Free author tools](${appUrl("/tools")}): KDP spine width and cover size calculator, novel word counts by genre, trim size guide, writing pace calculator
- [Where readers are](${appUrl("/tools/where-readers-are")}): book promotion sites, ads, reader communities, ARC services, and newsletter swaps, with costs and self-promotion rules
- [Comparisons and switching guides](${appUrl("/compare")}): fair comparisons with Scrivener, Vellum, Atticus, BetaBooks, and NetGalley, and how to bring a book over
- [Your data, your exit](${appUrl("/your-data")}): export manuscripts and reader lists anytime, on every plan
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

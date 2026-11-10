import { SUB_ALLOWANCE } from "@/lib/types";

/** Plan copy shared by the For authors, Pricing, and Billing pages so they never disagree. */
export type PlanCopy = {
  id: "free" | "pro" | "studio";
  name: string;
  price: string;
  note: string;
  lead: string;
  items: string[];
};

export const PLANS: PlanCopy[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    note: "forever",
    lead: "Everything you need to write your book.",
    items: [
      "Full writing studio: chapters, scene notes, focus mode, find and replace",
      "Story bible for characters, places, lore, and timeline",
      "1 project (add more for $9 each, one time)",
      "A private writing record of how every book came together",
      "Verified writing challenges: join one or start one with your group on any dates, with streaks and leaderboards",
      "One switch to turn every AI tool off",
      "Basic DOCX and EPUB export, front and back matter, KDP readiness checklist",
      "Set up book styles, preview your ebook on Kindle, phone, and tablet screens, and see the first chapters as printed pages",
      "“Where readers are”: promotion sites, ads, reader communities, and ARC services, with costs and self-promotion rules",
      "AI critique pay as you go, with credit packs from $5",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$19",
    note: "per month",
    lead: "Write more books and put them in front of readers.",
    items: [
      "Everything in Free",
      "Unlimited projects",
      "Book formatting: 8 book styles with drop caps, chapter openings, and scene-break ornaments, downloaded as a polished, store-ready ebook",
      "Print-ready paperback PDFs: 5 trim sizes, running heads and page numbers, margins that follow KDP's page-count rules, and a checklist before you upload",
      "Cover builder: design your front, spine, and back cover with your own art and our fonts, then save the ebook cover and a print-ready paperback cover PDF",
      "Cover tools: ebook cover checks, the exact paperback wrap size and spine width for KDP or IngramSpark, and a cover template for your designer",
      "Marketing images from your cover: a 3D book, plus ready-sized ads and posts for Facebook, Instagram, stories, Pinterest, and BookBub",
      "Book details and auto pages: title page, copyright with your ISBN, contents, also-by with links, and a review request, with the “Made with Novelist Writer” credit optional",
      "Your own author site: photo, bio, links, themes, and every book in one place",
      "A launch page for every book that grows with it: cover reveal, preorders, then buy buttons on release day",
      "Readers add your book to their TBR from your launch page and the catalog, and you see how many TBRs, shelves, and reader lists each book is on (counts only, never who)",
      "Your public writing record and badges, like “Written in Novelist Writer”, “No AI used on this book”, and writing challenge wins",
      "Share kit: ready-to-post copy for every network, a newsletter block, a square image, and link previews",
      "Posts made from your book, not by AI: quote cards in your book's fonts (marked “From the book” when we find the line in your manuscript) and verified writing progress cards",
      "A posting calendar with a reminder on the day, one-tap sharing to X, Threads, and Bluesky, and copy-and-download for Instagram, TikTok, and Facebook",
      "Your marketing year: a monthly newsletter, backlist spotlights, book birthdays, and seasonal reader moments for your genre, added to the calendar in one click",
      "Marketing results all year: visitors to your site and book pages, where they came from, buy clicks by book and store, your best posts, and tracked links for anywhere you share",
      "Join group promos: put your book on a themed page with other authors in your genre, share it, and see the readers your share brought",
      "Your published books listed in the Novelist Writer catalog, and new releases featured in the weekly reader digest",
      "Optional: your releases, launches, and reader calls featured on Novelist Writer's social accounts",
      `${SUB_ALLOWANCE.pro} AI critique credits every month for line edits, developmental notes, continuity, plotholes, pacing, and more`,
    ],
  },
  {
    id: "studio",
    name: "Studio",
    price: "$49",
    note: "per month",
    lead: "Run beta readers, ARCs, and your audience from one place.",
    items: [
      "Everything in Pro",
      "Beta reader desk: application forms, auto-approve rules, end dates with a 3-day grace for final reviews, chapter progress, DNF reasons, comments pinned to the sentence",
      "ARC desk: read-by deadlines, reminders, mailing addresses, one-tap review links",
      "Reader feedback beside the editor: each chapter's comments next to the text, resolve and reply as you revise",
      "Export every comment, reply, final review, DNF reason, and ARC review as a Word document",
      "Reader insights: who joined when, how far each reader got, how often they come back, and where they drop off",
      "Reader badges and author ratings on every applicant, so you pick readers with a track record",
      "A feedback brief readers see before applying (what you want, how rough the draft is, how long it takes), with guided questions that make honest notes easier to give",
      "Email signups on your author site and launch pages, audience lists across all your books, CSV export",
      "Beta and ARC calls on your launch pages, and your books listed in the reader catalog",
      "Launch plan: a countdown from cover reveal to reviews, with one-click steps, countdown images, ready-to-edit posts, and a readiness score",
      "Launch day in one click: readers who asked to hear about the book get an email, followers are told, and every ARC reader is asked to post their review",
      "“Launching this week” spotlight on the reader catalog and home page, plus a launch team of readers who share, review, and ask their library",
      "Launch week dashboard: visitors, buy clicks by store, new list signups, and reviews as they come in",
      "A sample chapter on your launch page, styled like your book, right before the buy buttons",
      "ARC readers download a copy marked with their name for Kindle or any e-reader, and you thank readers in one click",
      "Review cards: turn ARC reviews into post images, credited to “Advance reader” or the reader's first name",
      "Series and deal planning: book one pushed before each new release, and price promotions spaced through the year, each matched to deal sites that fit",
      "List growth in your results: new signups and unsubscribes over time, and which sources bring readers who join",
      "Newsletter swaps with real list sizes: find authors in your genre, agree on send days, and see how many readers each side's send brought",
      "Host group promos: gather books around a theme on a public page, approve who's in, and see whose share brought readers",
      "An ebook for each store: Kindle, Apple Books, Kobo, Google Play, and Barnes & Noble builds whose review and “Also by” links point only to that store",
      "Box sets: bundle your books into one ebook or paperback, with a divider for each book and chapter numbers that start again",
      "Series tools",
      `${SUB_ALLOWANCE.studio} AI credits every month, bring your own API key, priority AI`,
    ],
  },
];

/** Founding members: the first FOUNDING_CAP subscribers keep FOUNDING_PERCENT off for as long as they stay subscribed. */
export const FOUNDING_PERCENT = 20;
export const FOUNDING_CAP = 500;

/** Capped lifetime deals. One payment; no AI credits. */
export const LIFETIME = {
  pro: { cents: 44900, cap: 300, label: "Lifetime Pro" },
  studio: { cents: 109900, cap: 100, label: "Lifetime Studio" },
} as const;

/** "$19" → "$15.20" */
export function foundingPrice(price: string) {
  const n = Number(price.replace(/[^0-9.]/g, ""));
  return n ? `$${(n * (1 - FOUNDING_PERCENT / 100)).toFixed(2)}` : price;
}

export const PAY_AS_YOU_GO = [
  "Extra projects: $9 each, one time",
  "AI credit packs from $5",
  "The price is shown before every AI run",
];

/** Honest answers to what people ask before paying. */
export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "Do readers pay anything?",
    a: "No. Reader accounts, beta reads, and advance copies are free, with no ads. Authors pay for the tools that run their reading programs.",
  },
  {
    q: "Can I earn Studio without paying?",
    a: "Yes. Share your books and bring readers and writers to Novelist Writer to earn free Studio days. Bank up to 28 and start them when your next book is ready. Free days don't include AI credits.",
  },
  {
    q: "What happens when Studio ends?",
    a: "Your beta and ARC listings, applications, and invites pause right away, and current readers get 7 days to finish. Reader comments, reviews, and insights are kept and unlock again when you're back on Studio. Any banked free Studio days start on their own first.",
  },
  {
    q: "Will my price go up when you add features?",
    a: "Not while you stay subscribed. When prices change, current subscribers keep the price they signed up at for as long as their subscription stays active.",
  },
  {
    q: "What happens when Pro ends?",
    a: "Your author site and launch pages stay up for 7 more days, then visitors see a simple holding page until you're back. Nothing is deleted. On Free, your most recently edited book (plus any you paid $9 to unlock) stays open and the others can still be exported.",
  },
  {
    q: "What does Studio do for my launch?",
    a: "Set a release date and Studio builds your launch plan: cover reveal, advance copies, preorders, countdown posts, and launch day, each with a one-click step. On launch day one button marks the book out now, emails readers who asked to hear, notifies your followers, and asks ARC readers to post reviews. Your book appears in “Launching this week”, a launch team of readers helps spread the word, and a launch week dashboard shows visitors, buy clicks, signups, and reviews.",
  },
  {
    q: "Will Novelist Writer write my marketing posts?",
    a: "No. Readers can tell, and it's not what we're about. Instead the Marketing page turns things only you have into posts: lines from your book (on cards in your book's fonts), your real ARC reviews (Studio), and your verified writing progress. Plan them on the posting calendar and we remind you on the day. Your marketing year suggests when to post (newsletters, backlist spotlights, book birthdays, seasonal moments for your genre), and the free “Where readers are” guide shows where, what it costs, and the rules. Results then show which posts and places actually brought readers and buy clicks. You write the words; we make it quick to share them.",
  },
  {
    q: "How do newsletter swaps and group promos work?",
    a: "In a newsletter swap (Studio), you feature another author's book in your newsletter and they feature yours. List sizes come from confirmed subscribers, so nobody can inflate them, and each swap's link is tagged so you both see how many readers the other side's send brought. In a group promo, authors in one genre put their books on a public page for a week or so, often on sale, and everyone shares it. Joining is on Pro; hosting is on Studio. Agreed send and share days go straight onto your marketing calendar.",
  },
  {
    q: "What does founding member pricing mean?",
    a: "The first 500 Pro or Studio subscribers pay 20% less for as long as they stay subscribed, on monthly or yearly billing, and get a Founding member badge on their author page. If you cancel and come back later, you keep the founding price. Everyone who subscribed before this offer is already a founding member. Once the 500 spots are gone, the offer ends.",
  },
  {
    q: "What do Lifetime Pro and Lifetime Studio include?",
    a: "One payment for that plan's features for as long as Novelist Writer runs, including features we add to that plan later, plus a Lifetime member badge. Lifetime plans don't include monthly AI credits (you can buy credit packs anytime). Spots are capped: 300 for Lifetime Pro at $449 and 100 for Lifetime Studio at $1,099. If you have a subscription when you buy, we stop it at the end of the period you've paid for.",
  },
  {
    q: "Do you have an affiliate program?",
    a: "Yes. Approved affiliates earn 30% of what each writer they refer pays for Pro or Studio in their first 12 months. Commissions are held 60 days for refunds, then paid on the 1st of each month through Stripe once they reach $25. Anyone can also keep earning free Studio days by sharing their link.",
  },
  {
    q: "How do writing challenges work?",
    a: "They're free on every plan. Join a public challenge or start a private one for your writing group, on any dates. Each day counts the words your books grew by, but never more than you typed in the editor, so pasted, imported, and deleted text never counts. Finish to earn a winner badge, shown on your author site on Pro.",
  },
  {
    q: "Do I have to use AI?",
    a: "No. AI only critiques and never writes your book. One switch in Settings turns every AI tool off, and your books can show that.",
  },
  {
    q: "Will AI companies train on my author site or book pages?",
    a: "We block AI training crawlers from author sites, launch pages, writing records, and reader profiles. AI search tools (like ChatGPT search and Perplexity) can still find and link to your pages, so readers asking AI for book recommendations can discover you.",
  },
  {
    q: "Do I still need Vellum or Atticus?",
    a: "For formatting, not anymore, and it works on Windows too. Pro formats your book in the browser with 8 book styles, chapter openings, scene breaks, and front and back pages built from your book details. Download a store-ready EPUB for Kindle, Apple Books, Kobo, and Google Play, and save a print-ready paperback PDF with running heads, page numbers, and margins set for KDP. The cover builder designs your front, spine, and back cover on the exact wrap for your page count and saves both the ebook cover and the paperback cover PDF, and your cover becomes a 3D book and ready-sized ads. Studio adds an ebook for each store and box sets.",
  },
  {
    q: "Is my manuscript used to train AI?",
    a: "Never. And your manuscript export is never held hostage: DOCX and EPUB export are on every plan.",
  },
];

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
      "Book details and auto pages: title page, copyright with your ISBN, contents, also-by with links, and a review request",
      "Your own author site: photo, bio, links, themes, and every book in one place",
      "A launch page for every book that grows with it: cover reveal, preorders, then buy buttons on release day",
      "Your public writing record and badges, like “Written in Novelist Writer”, “No AI used on this book”, and writing challenge wins",
      "Share kit: ready-to-post copy for every network, a newsletter block, a square image, and link previews",
      "Your published books listed in the Novelist Writer catalog",
      `${SUB_ALLOWANCE.pro} AI critique credits every month for line edits, developmental notes, continuity, plotholes, pacing, and more`,
    ],
  },
  {
    id: "studio",
    name: "Studio",
    price: "$39",
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
      "Email signups on your author site and launch pages, audience lists across all your books, CSV export",
      "Beta and ARC calls on your launch pages, and your books listed in the reader catalog",
      "An ebook for each store: Kindle, Apple Books, Kobo, Google Play, and Barnes & Noble builds whose review and “Also by” links point only to that store",
      "Box sets: bundle your books into one ebook or paperback, with a divider for each book and chapter numbers that start again",
      "Series tools",
      `${SUB_ALLOWANCE.studio} AI credits every month, bring your own API key, priority AI`,
    ],
  },
];

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

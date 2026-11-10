import { PLANS, PRICING_FAQ } from "@/lib/plans";

/**
 * Site wording you can edit in admin. Each block keeps its built-in default here; edits are stored in the
 * site_text table and replace only the fields you changed. Text fields accept [links](/page).
 */
export type Point = { t: string; d: string };
export type TextBlock = {
  kicker?: string;
  heading?: string;
  intro?: string;
  note?: string;
  items?: Point[];
  list?: string[];
  faq?: { q: string; a: string }[];
};
export type TextField = keyof TextBlock;
export type TextEntry = { key: string; page: string; label: string; fields: TextField[]; paths: string[]; default: TextBlock };

export const FIELD_LABEL: Record<TextField, string> = {
  kicker: "Small label above the heading",
  heading: "Heading (start a new line with Enter)",
  intro: "Intro paragraph",
  note: "Second paragraph",
  items: "Points (title and description)",
  list: "List",
  faq: "Questions and answers",
};

const plan = (id: "free" | "pro" | "studio") => PLANS.find((p) => p.id === id)!;
const PLAN_PATHS = ["/", "/pricing", "/authors", "/lifetime", "/llms.txt"];

export const SITE_TEXT: TextEntry[] = [
  {
    key: "home.hero",
    page: "Home",
    label: "Top of the page",
    fields: ["kicker", "heading", "intro"],
    paths: ["/"],
    default: {
      kicker: "Novelist Writer",
      heading: "Write it yourself.\nProve it.",
      intro:
        "The writing studio that takes your novel from first draft through beta readers, ARCs, and a beautifully formatted ebook to launch. AI critiques, never writes, and turns off with one switch.",
    },
  },
  {
    key: "home.proof",
    page: "Home",
    label: "Proof of authorship",
    fields: ["kicker", "heading", "intro", "items"],
    paths: ["/"],
    default: {
      kicker: "Proof of authorship",
      heading: "Your writing history is your proof",
      intro:
        "Readers are asking whether a person really wrote the book. Novelist Writer keeps a record of how yours came together, session by session, from the day you start writing here. On Pro and Studio, publish it right next to your book with a “Written in Novelist Writer” badge.",
      items: [
        { t: "Typed here, not pasted", d: "The editor keeps a private count of what you typed, what you pasted, and what you imported. Never your words, just the process of how they got there." },
        { t: "Every session, every day", d: "Months of writing sessions and revisions add up to a history nobody can fake in an afternoon." },
        { t: "Early writers aren't penalized", d: "Anything written before records began is marked “Before records” and never counts against you." },
        {
          t: "Badges readers can trust",
          d: "Books with no AI run on them show “No AI used on this book.” Turn AI off entirely and your page says so. You choose whether badges and your writing record show on your Beta and ARC listings.",
        },
      ],
    },
  },
  {
    key: "home.ai",
    page: "Home",
    label: "AI your way",
    fields: ["kicker", "heading", "intro"],
    paths: ["/"],
    default: {
      kicker: "AI your way",
      heading: "An editor, never a ghostwriter",
      intro:
        "AI here only reports problems and asks questions. Nothing writes your chapters, nothing pastes prose into your book, and we never train on your manuscript. Don't want any of it? One switch in Settings turns every AI tool off, and your books show it.",
    },
  },
  {
    key: "home.studio",
    page: "Home",
    label: "Studio: draft to launch",
    fields: ["kicker", "heading", "intro", "items"],
    paths: ["/"],
    default: {
      kicker: "Studio",
      heading: "From draft to launch in one place",
      intro:
        "Most writers juggle a word processor, a beta tool, an ARC service, and a spreadsheet of readers. Studio puts your beta readers, ARC readers, and the audience they become in the same place your book is written.",
      items: [
        { t: "Beta readers, run like a desk", d: "Application forms, auto-approve rules, an end date readers can see (plus 3 days to send final reviews), progress by chapter, DNF reasons, and comments pinned to the exact sentence." },
        { t: "ARC copies with a deadline", d: "Send advance copies, set a read-by date, send reminders before it, and close the manuscript when it passes." },
        { t: "Feedback where you write", d: "Each chapter's reader comments sit right beside the text as you revise. Resolve and reply without leaving the page, or export everything as a Word document." },
        { t: "See where readers stop", d: "Reader insights chart who joined when, how far each reader got, how often they come back, and the chapter where most of them drop off." },
        { t: "Pick readers with a track record", d: "Every applicant shows their badges: Finisher, On time, Thoughtful feedback, Reviewer, and Top rated, plus ratings from other authors." },
        { t: "Reviews in one tap", d: "When ARC readers finish, they get a button per store plus Copy review, and mark where they posted." },
        { t: "An audience you keep", d: "Every beta and ARC reader joins one list across all your books, with CSV export for your newsletter tool." },
      ],
    },
  },
  {
    key: "home.format",
    page: "Home",
    label: "Formatting",
    fields: ["kicker", "heading", "intro", "items"],
    paths: ["/"],
    default: {
      kicker: "Format · Pro and Studio",
      heading: "A beautiful ebook and paperback, without another app",
      intro:
        "Pick a book style, see your book on Kindle, phone, and tablet screens as you go, and download a store-ready EPUB for Kindle, Apple Books, Kobo, and Google Play. Then lay it out as printed pages and save a paperback PDF ready for KDP, design a cover that fits your exact spine, and turn it into a 3D book and ready-sized ads. Studio adds an ebook for each store and box sets. No Vellum, no Mac, no extra license.",
      items: [
        { t: "8 book styles", d: "Classic, literary, romance, thriller, fantasy, cozy, modern, and YA, each with matched fonts, drop caps or small caps, chapter openings, and scene-break ornaments." },
        { t: "Pages built for you", d: "Fill in your book details once to get a title page, a copyright page with your ISBN, contents, an also-by page that links your other books, and a review request." },
        { t: "Smart chapters", d: "Prologues, epilogues, and part pages are spotted for you and numbered the way real books are, in the chapter heading style you choose." },
        { t: "Print-ready paperbacks", d: "Five trim sizes, large print in one click, running heads, a contents page with real page numbers, and inside margins that grow with your page count the way KDP requires." },
        { t: "Checked before you upload", d: "A checklist covers page count limits, margins, fonts, and your copyright page, and the page count flows straight into your cover size." },
        { t: "A cover builder that fits", d: "Design the front, spine, and back on the exact wrap for your page count, with your own art and our fonts. It warns about the safe area and blurry art, then saves your ebook cover and paperback cover PDF." },
      ],
    },
  },
  {
    key: "home.launch",
    page: "Home",
    label: "Launch pages and author site",
    fields: ["kicker", "heading", "intro", "items"],
    paths: ["/"],
    default: {
      kicker: "Launch · Pro and Studio",
      heading: "A launch page and an author site, built in",
      intro:
        "On Pro, every book gets a page that grows with it: cover reveal and preorders, then buy buttons on release day, with beta and ARC calls on Studio. Your author site gathers every book, your bio, and your links at one short address you can put anywhere.",
      items: [
        { t: "Made to be shared", d: "Copy-ready posts for every network, a block for your newsletter, and a square image for Instagram." },
        { t: "Readers join your list", d: "Visitors sign up on your page and confirm by email, so your list stays real." },
        { t: "Proof travels with it", d: "Badges like “No AI used on this book” show wherever your book does, including link previews." },
      ],
    },
  },
  {
    key: "home.launch_engine",
    page: "Home",
    label: "Launch without crickets",
    fields: ["kicker", "heading", "intro", "items"],
    paths: ["/"],
    default: {
      kicker: "Studio",
      heading: "Launch without crickets",
      intro: "Launching a book is the scariest part. Studio walks you through it, gets reviews in on day one, and sends Novelist Writer's readers to your launch.",
      items: [
        { t: "A plan that counts down", d: "From cover reveal to reviews, every step has a date, a one-click action, and a post you can edit. A readiness score shows what's left." },
        { t: "Launch day in one click", d: "Readers who asked to hear get an email, followers are told, and every ARC reader is asked to post their review today." },
        { t: "Readers come to you", d: "Your book shows in “Launching this week”, readers can try a sample chapter, and a launch team shares, reviews, and asks their library." },
        { t: "Watch it happen", d: "A launch week dashboard shows visitors, buy clicks by store, new signups, and reviews as they arrive." },
        { t: "Readers feel the thanks", d: "ARC readers get a copy for any e-reader, and you thank them in one click. Authors who do earn a “Thanks readers” label." },
        { t: "Gentle on your inbox", d: "Launch email goes out in batches that stay inside Gmail's daily limit, with an unsubscribe link on every list email." },
        { t: "Posts from your own book", d: "Quote cards in your book's fonts, ARC review cards, and verified writing progress, on a posting calendar that reminds you, plus a year of ideas built around your releases. Never written by AI." },
      ],
    },
  },
  {
    key: "home.challenges",
    page: "Home",
    label: "Writing challenges",
    fields: ["kicker", "heading", "intro", "items"],
    paths: ["/"],
    default: {
      kicker: "Challenges · Free",
      heading: "Writing challenges where every word is real",
      intro:
        "Join a challenge or start one with your writing group, on any dates. Words are counted from your writing record, so only what you type counts. No pasted chapters, no padded totals, and a winner badge that means something.",
      items: [
        { t: "Verified word counts", d: "Each day counts what your books grew by, never more than you typed. Pasted, imported, and deleted text never counts." },
        { t: "Streaks and leaderboards", d: "Keep a daily streak, climb the leaderboard, and share progress cards as you go." },
        { t: "Badges that travel", d: "Finish a challenge to earn a winner badge, shown on your author site on Pro." },
      ],
    },
  },
  {
    key: "home.earn",
    page: "Home",
    label: "Share and earn",
    fields: ["kicker", "heading", "intro"],
    paths: ["/"],
    default: {
      kicker: "Share & earn",
      heading: "Bring readers, earn Studio for free",
      intro:
        "Every link you share carries your name. When people visit, readers join your beta or ARC, or a writer you invited gets going, you earn free days of Studio's beta desk, ARC desk, and audience lists. Bank up to four weeks and start them when your next book is ready.",
    },
  },
  {
    key: "home.readers",
    page: "Home",
    label: "For readers",
    fields: ["kicker", "heading", "intro", "items"],
    paths: ["/"],
    default: {
      kicker: "For readers",
      heading: "Read books before anyone else. Free.",
      intro: "Beta read and get advance copies from indie authors, right in your browser. No ads, no fees, ever.",
      items: [
        { t: "Know how it was written", d: "Listings can show “No AI used on this book” and a writing record, so you see how a book came together before you apply." },
        { t: "Your feedback, on the page", d: "Highlight a sentence and tell the author what you felt. Clear end dates and read-by dates, with time to send your final review." },
        { t: "Badges authors notice", d: "Finish books, leave thoughtful feedback, and post ARC reviews to earn badges that authors see when you apply." },
      ],
    },
  },
  {
    key: "home.yours",
    page: "Home",
    label: "Your book stays yours",
    fields: ["heading", "intro"],
    paths: ["/"],
    default: {
      heading: "Your book stays yours",
      intro: "We never train on your manuscript. Export is never held hostage. Write free forever; pay only for extra projects or AI runs, or subscribe if you prefer.",
    },
  },
  {
    key: "authors.hero",
    page: "For authors",
    label: "Top of the page",
    fields: ["kicker", "heading", "intro"],
    paths: ["/authors"],
    default: {
      kicker: "For authors",
      heading: "Write it yourself.\nProve it. Launch it.",
      intro:
        "One studio from first draft to release day: a record of how you wrote it, beta readers and ARCs that live where your book does, their feedback right beside each chapter as you revise, and, from Pro up, polished ebook and paperback formatting plus an author site and launch pages you can share anywhere. AI critiques and never writes, and it turns off with one switch.",
    },
  },
  {
    key: "authors.plans",
    page: "For authors",
    label: "Plans heading",
    fields: ["heading"],
    paths: ["/authors"],
    default: { heading: "Pick what fits" },
  },
  {
    key: "authors.earn",
    page: "For authors",
    label: "Earn Studio for free",
    fields: ["heading", "intro"],
    paths: ["/authors"],
    default: {
      heading: "Earn Studio for free",
      intro:
        "Every link you share carries your name. When people visit, readers join your beta or ARC, or a writer you invited gets going, you earn free days of Studio's reader tools (AI credits not included). Bank up to four weeks and start them when your next book is ready.",
    },
  },
  {
    key: "authors.every_plan",
    page: "For authors",
    label: "On every plan",
    fields: ["heading", "list"],
    paths: ["/authors"],
    default: {
      heading: "On every plan",
      list: [
        "Your book stays yours: we never train on your manuscript",
        "Export your manuscript anytime; it's never held hostage ([your data, your exit](/your-data))",
        "Coming from Scrivener, Word, Vellum, or Atticus? [See how to switch](/compare)",
        "A private record of how you wrote every book",
        "Public pages (Pro and up) show up in AI search answers, with AI training blocked on them",
        "One switch to turn every AI tool off",
      ],
    },
  },
  {
    key: "authors.cta",
    page: "For authors",
    label: "Closing line",
    fields: ["heading"],
    paths: ["/authors"],
    default: { heading: "Your first book is free" },
  },
  {
    key: "readers.hero",
    page: "For readers",
    label: "Top of the page",
    fields: ["kicker", "heading", "intro"],
    paths: ["/readers"],
    default: {
      kicker: "For readers",
      heading: "Read books before\nanyone else. Free.",
      intro: "Beta read and get advance copies from indie authors, tell them what worked right on the page, and follow the writers you love. A reader account costs nothing, ever.",
    },
  },
  {
    key: "readers.features",
    page: "For readers",
    label: "What you can do",
    fields: ["heading", "items"],
    paths: ["/readers"],
    default: {
      heading: "What you can do",
      items: [
        { t: "Read before anyone else", d: "Browse books open for beta readers and advance reader copies (ARCs) by genre. Read the blurb or a sample chapter, then apply or request a copy." },
        { t: "Read in your browser or on your e-reader", d: "Your place is saved on every device. Advance copies can also be downloaded for Kindle, Kobo, or Apple Books, marked with your name, with Send to Kindle steps built in." },
        { t: "Comment on the exact sentence", d: "Highlight a passage and tell the author what you felt, or leave notes for a whole chapter. Authors see your notes right beside the chapter as they revise, and can react and reply." },
        { t: "Finish, or say why you stopped", d: "Leave a short review when you finish a beta read, or mark it DNF with a reason. Both help the author more than you'd think." },
        { t: "ARC reviews in one tap", d: "When you finish an advance copy, you get a button for each store the author picked, plus Copy review so you can paste what you wrote." },
        { t: "Physical copies and thank-you gifts", d: "Some authors ask ARC readers for a mailing address to send a print copy or a small thank-you. Only that author ever sees it." },
        { t: "Follow authors you love", d: "Get a notification (and an email, if you want one) when they open a new beta read or ARC, and join their email list in one click." },
        { t: "A weekly reading list", d: "Turn on the reader digest for one email every Thursday: new books from authors you follow, launches, new releases, free advance copies, and book promotions, focused on the genres you pick." },
        { t: "Know how a book was written", d: "Before you apply, listings can show badges like “No AI used on this book” or “Written in Novelist Writer,” and a writing record summary, when the author chooses to share them." },
        { t: "Clear dates, fair time", d: "Every beta read shows when it ends, and you get 3 extra days after that to send your final review. Advance copies show their read-by date." },
        { t: "Earn reader badges", d: "Finisher, On time, Thoughtful feedback, Reviewer, Top rated, Launch day, and Launch team. Authors see your badges when you apply, so a good track record gets you picked." },
        { t: "Join a launch team", d: "Help an author you love launch: share on release day, post a review, and ask your library to stock the book. Authors can thank the whole team, and some thank every reader. Look for “Thanks readers”." },
        { t: "Step away gracefully", d: "Can't finish an advance copy? Step away with an optional reason instead of going quiet. The author hears, and nobody's left wondering." },
        { t: "A public reader profile, if you want one", d: "Turn it on to share a page with your badges and reading stats. It never lists the books you read or anything you wrote in them." },
      ],
    },
  },
  {
    key: "readers.cost",
    page: "For readers",
    label: "What it costs",
    fields: ["heading", "intro", "note"],
    paths: ["/readers"],
    default: {
      heading: "What it costs",
      intro: "Nothing. Reader accounts are free, beta reads and advance copies are free, and there are no ads. Authors pay for the tools that run their reading programs, so readers never do.",
      note: "Also a writer? It's the same login. Switch between your reader and author dashboards anytime.",
    },
  },
  {
    key: "pricing.hero",
    page: "Pricing",
    label: "Top of the page",
    fields: ["heading", "intro"],
    paths: ["/pricing"],
    default: {
      heading: "Pricing",
      intro: "Write free forever. Your first book is free, and every plan keeps a record of how you wrote it and lets you switch AI off entirely. AI critiques craft; it never writes your novel.",
    },
  },
  { key: "plans.free", page: "Plans", label: "Free plan", fields: ["intro", "list"], paths: PLAN_PATHS, default: { intro: plan("free").lead, list: plan("free").items } },
  { key: "plans.pro", page: "Plans", label: "Pro plan", fields: ["intro", "list"], paths: PLAN_PATHS, default: { intro: plan("pro").lead, list: plan("pro").items } },
  { key: "plans.studio", page: "Plans", label: "Studio plan", fields: ["intro", "list"], paths: PLAN_PATHS, default: { intro: plan("studio").lead, list: plan("studio").items } },
  { key: "pricing.faq", page: "Pricing", label: "Pricing questions", fields: ["faq"], paths: ["/pricing", "/llms.txt"], default: { faq: PRICING_FAQ } },
];

export const SITE_TEXT_BY_KEY = new Map(SITE_TEXT.map((e) => [e.key, e]));

/** Keep only fields this block allows, trimmed and size-limited. */
export function cleanBlock(entry: TextEntry, raw: unknown): TextBlock {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: TextBlock = {};
  const str = (v: unknown, max: number) => String(v ?? "").slice(0, max).trim();
  for (const f of entry.fields) {
    const v = o[f];
    if (v === undefined || v === null) continue;
    if (f === "items" && Array.isArray(v)) out.items = v.map((p) => ({ t: str((p as Point)?.t, 160), d: str((p as Point)?.d, 800) })).filter((p) => p.t).slice(0, 30);
    else if (f === "list" && Array.isArray(v)) out.list = v.map((x) => str(x, 500)).filter(Boolean).slice(0, 60);
    else if (f === "faq" && Array.isArray(v)) out.faq = v.map((x) => ({ q: str((x as { q?: string })?.q, 300), a: str((x as { a?: string })?.a, 2000) })).filter((x) => x.q && x.a).slice(0, 40);
    else if (f === "kicker" || f === "heading") out[f] = str(v, 200);
    else if (f === "intro" || f === "note") out[f] = str(v, 2000);
  }
  return out;
}

/** The block as shown on the site: your edit for each field you changed, the built-in wording for the rest. */
export function mergeBlock(entry: TextEntry, override: TextBlock | null | undefined): TextBlock {
  const merged: TextBlock = { ...entry.default };
  for (const f of entry.fields) {
    const v = override?.[f];
    if (v === undefined) continue;
    if (Array.isArray(v) ? v.length > 0 : String(v).trim() !== "") (merged as Record<string, unknown>)[f] = v;
  }
  return merged;
}

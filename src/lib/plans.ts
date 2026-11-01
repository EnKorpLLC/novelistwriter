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
    lead: "Everything you need to write and launch one book.",
    items: [
      "Full writing studio: chapters, scene notes, focus mode, find and replace",
      "Story bible for characters, places, lore, and timeline",
      "1 project (add more for $9 each, one time)",
      "Writing record and badges that show you wrote it, shown where you choose",
      "One switch to turn every AI tool off",
      "DOCX and EPUB export, front and back matter, KDP readiness checklist",
      "Launch page for your book and your own author site",
      "AI critique pay as you go, with credit packs from $5",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$16",
    note: "per month",
    lead: "For writers with more than one book on the go.",
    items: [
      "Everything in Free",
      "Unlimited projects",
      `${SUB_ALLOWANCE.pro} AI critique credits every month for line edits, developmental notes, continuity, plotholes, pacing, and more`,
    ],
  },
  {
    id: "studio",
    name: "Studio",
    price: "$32",
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
      "Audience lists across all your books, guest email signups, CSV export",
      "Your books listed in the reader catalog",
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
    a: "Your beta and ARC listings, applications, and invites pause right away, and current readers get 7 days to finish. Reader comments, reviews, and insights are kept and unlock again when you're back on Studio. On Free, your most recently edited book (plus any you paid $9 to unlock) stays open and the others can still be exported; Pro keeps every project open.",
  },
  {
    q: "Do I have to use AI?",
    a: "No. AI only critiques and never writes your book. One switch in Settings turns every AI tool off, and your books can show that.",
  },
  {
    q: "Is my manuscript used to train AI?",
    a: "Never. And your manuscript export is never held hostage: DOCX and EPUB export are on every plan.",
  },
];

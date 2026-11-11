/** The creative marketplace's types of pro. Client-safe. */

export type MarketGroup = "editing" | "art" | "narration";

export const MARKET_TYPES = [
  { id: "dev_edit", group: "editing", label: "Developmental editor", plural: "Developmental editors", blurb: "Manuscript critiques and developmental edits: story, structure, character, pacing." },
  { id: "line_copy", group: "editing", label: "Line and copy editor", plural: "Line and copy editors", blurb: "Line edits for voice and flow, copy edits for grammar, consistency, and style." },
  { id: "proofread", group: "editing", label: "Proofreader", plural: "Proofreaders", blurb: "A last careful pass for typos and slips before publishing." },
  { id: "cover", group: "art", label: "Cover designer", plural: "Cover designers", blurb: "Ebook, paperback, and audiobook covers." },
  { id: "illustration", group: "art", label: "Illustrator or character artist", plural: "Illustrators and character artists", blurb: "Character art, interior illustrations, and chapter headers." },
  { id: "maps", group: "art", label: "Map maker", plural: "Map makers", blurb: "Maps of your world, for the book and for readers." },
  { id: "narration", group: "narration", label: "Narrator", plural: "Narrators", blurb: "Human-narrated audiobooks, recorded in Novelist Writer's studio or your own." },
] as const satisfies readonly { id: string; group: MarketGroup; label: string; plural: string; blurb: string }[];

export type MarketTypeId = (typeof MARKET_TYPES)[number]["id"];
export const MARKET_TYPE_IDS = MARKET_TYPES.map((t) => t.id) as MarketTypeId[];
export const isMarketType = (v: unknown): v is MarketTypeId => typeof v === "string" && (MARKET_TYPE_IDS as string[]).includes(v);
export const marketType = (id: string) => MARKET_TYPES.find((t) => t.id === id) || null;

/** A type opens when this many pros are approved for it (the admin can change it per type). */
export const DEFAULT_OPEN_AT = 5;

/** What each kind of pro promises before applying. */
export const HUMAN_PROMISE: Record<MarketGroup, string> = {
  editing:
    "I edit by hand. I don't use generative AI to rewrite, edit, or critique a client's writing. Spelling, grammar, and consistency checkers are fine.",
  art: "I make my art myself, with no generative AI at any stage. Licensed stock is fine when I list it. I'll show my process (a sketch, a work in progress, and the final) with every delivery.",
  narration: "I narrate with my own voice. No AI or synthetic voices, ever.",
};

/** recruiting: still gathering pros. ready: enough pros, waiting for hiring to open. open: authors can hire. */
export type MarketState = "recruiting" | "ready" | "open";

export type MarketTypeStatus = {
  id: MarketTypeId;
  label: string;
  plural: string;
  blurb: string;
  group: MarketGroup;
  approved: number;
  applied: number;
  waiting: number;
  threshold: number;
  override: "auto" | "open" | "closed";
  state: MarketState;
};

export type PortfolioItem = { id: string; title: string; note: string; url?: string; key?: string; before?: string; after?: string };
export const PORTFOLIO_MAX = 10;
export const PRO_STATUSES = ["draft", "applied", "changes", "approved", "declined", "paused", "removed"] as const;
export type ProStatus = (typeof PRO_STATUSES)[number];

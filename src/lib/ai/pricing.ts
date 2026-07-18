import type { JobType } from "@/lib/types";
import { CREDIT_COSTS } from "@/lib/types";

export type AiScope = "selection" | "chapter" | "book";
export type AiModelTier = "fast" | "standard" | "deep";

export const AI_MODEL_TIERS: Record<
  AiModelTier,
  {
    id: AiModelTier;
    label: string;
    blurb: string;
    creditMult: number;
    anthropicModel: string;
    openaiModel: string;
  }
> = {
  fast: {
    id: "fast",
    label: "Fast",
    blurb: "Quick pass · lower cost",
    creditMult: 0.5,
    anthropicModel: process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5-20251001",
    openaiModel: "gpt-4o-mini",
  },
  standard: {
    id: "standard",
    label: "Standard",
    blurb: "Best for craft notes",
    creditMult: 1,
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    openaiModel: "gpt-4o",
  },
  deep: {
    id: "deep",
    label: "Deep",
    blurb: "Heavier analysis · higher cost",
    creditMult: 2.5,
    anthropicModel: process.env.ANTHROPIC_MODEL_DEEP || "claude-opus-4-6",
    openaiModel: "gpt-4o",
  },
};

export const AI_SCOPE_MULT: Record<AiScope, number> = {
  selection: 0.5,
  chapter: 1,
  book: 3,
};

/** Jobs that usually need the full manuscript; UI defaults to book. */
export const BOOK_DEFAULT_JOBS: JobType[] = [
  "continuity",
  "plotholes",
  "lore_lock",
  "arcs",
  "promises",
  "dialogue_fingerprint",
  "pacing",
  "voice_analysis",
  "discover_comps",
  "reading_list",
  "bible_extract",
];

export function defaultScopeForJob(jobType: JobType): AiScope {
  if (jobType === "bible_extract") return "book";
  if (BOOK_DEFAULT_JOBS.includes(jobType)) return "book";
  return "chapter";
}

export function computeCritiqueCost(opts: {
  jobType: JobType;
  scope: AiScope;
  model: AiModelTier;
  /** Studio BYOK: platform fee only (user pays the model vendor). */
  usingByok?: boolean;
}): number {
  if (opts.usingByok) return 1;
  const base = CREDIT_COSTS[opts.jobType] ?? 8;
  const scopeMult = AI_SCOPE_MULT[opts.scope] ?? 1;
  const modelMult = AI_MODEL_TIERS[opts.model]?.creditMult ?? 1;
  return Math.max(1, Math.round(base * scopeMult * modelMult));
}

export function isValidModelTier(v: string): v is AiModelTier {
  return v === "fast" || v === "standard" || v === "deep";
}

export function isValidScope(v: string): v is AiScope {
  return v === "selection" || v === "chapter" || v === "book";
}

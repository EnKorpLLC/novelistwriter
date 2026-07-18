export type SubscriptionTier = "free" | "pro" | "studio";

export type JobType =
  | "line_edit"
  | "developmental"
  | "structural"
  | "voice_pass"
  | "continuity"
  | "plotholes"
  | "lore_lock"
  | "arcs"
  | "promises"
  | "dialogue_fingerprint"
  | "pacing"
  | "voice_analysis"
  | "discover_comps"
  | "targeted_compare"
  | "reading_list"
  | "sensitivity"
  | "blurb_critique"
  | "beta_summary"
  | "custom_persona";

export const CREDIT_COSTS: Record<JobType, number> = {
  line_edit: 2,
  developmental: 8,
  structural: 10,
  voice_pass: 8,
  continuity: 25,
  plotholes: 20,
  lore_lock: 18,
  arcs: 15,
  promises: 12,
  dialogue_fingerprint: 14,
  pacing: 16,
  voice_analysis: 20,
  discover_comps: 22,
  targeted_compare: 22,
  reading_list: 10,
  sensitivity: 12,
  blurb_critique: 6,
  beta_summary: 8,
  custom_persona: 15,
};

export const CREDIT_PACKS = {
  starter: { credits: 250, label: "Starter", envPrice: "STRIPE_PRICE_CREDITS_STARTER" },
  revision: { credits: 900, label: "Revision", envPrice: "STRIPE_PRICE_CREDITS_REVISION" },
  manuscript: { credits: 2800, label: "Manuscript", envPrice: "STRIPE_PRICE_CREDITS_MANUSCRIPT" },
} as const;

export const SUB_ALLOWANCE = {
  pro: 400,
  studio: 1200,
} as const;

export type CritiqueSeverity = "must_fix" | "consider" | "style";

export type CritiqueItem = {
  severity: CritiqueSeverity;
  confidence: number;
  category: string;
  title: string;
  body: string;
  citation_excerpt?: string;
  example_text?: string;
};

export type Project = {
  id: string;
  user_id: string;
  series_id: string | null;
  title: string;
  subtitle: string;
  genre: string;
  pov: string;
  status: string;
  blurb: string;
  metadata: Record<string, unknown>;
  kdp_settings: {
    trim?: string;
    font?: string;
    margins?: string;
  };
  is_unlocked: boolean;
  created_at: string;
  updated_at: string;
};

export type Chapter = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  sort_order: number;
  content_html: string;
  content_text: string;
  word_count: number;
  goal: string;
  conflict: string;
  outcome: string;
  pov: string;
  timeline_position: string;
  summary: string;
};

export type BibleEntry = {
  id: string;
  project_id: string;
  series_id: string | null;
  entry_type: "character" | "place" | "note" | "lore" | "rule" | "timeline";
  name: string;
  summary: string;
  details: Record<string, unknown>;
  speech_notes: string;
};

export type CreditBalance = {
  user_id: string;
  balance: number;
  monthly_allowance_remaining: number;
  subscription_tier: SubscriptionTier;
  free_ai_taste_remaining: number;
  stripe_customer_id: string | null;
};

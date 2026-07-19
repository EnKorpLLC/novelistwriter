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
  | "custom_persona"
  | "bible_extract";

export const CREDIT_COSTS: Record<JobType, number> = {
  line_edit: 10,
  developmental: 10,
  structural: 10,
  voice_pass: 10,
  continuity: 25,
  plotholes: 20,
  lore_lock: 25,
  arcs: 15,
  promises: 15,
  dialogue_fingerprint: 15,
  pacing: 20,
  voice_analysis: 20,
  discover_comps: 25,
  targeted_compare: 25,
  reading_list: 10,
  sensitivity: 15,
  blurb_critique: 10,
  beta_summary: 10,
  custom_persona: 15,
  bible_extract: 15,
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
  cover_path?: string | null;
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
  updated_at?: string;
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

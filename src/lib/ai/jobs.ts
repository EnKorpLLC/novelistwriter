import type { JobType } from "@/lib/types";

export const JOB_META: Record<
  JobType,
  { label: string; description: string }
> = {
  line_edit: {
    label: "Line edit",
    description:
      "Flags clarity, grammar, redundancy, and awkward phrasing at the sentence level. Does not rewrite your prose.",
  },
  developmental: {
    label: "Developmental",
    description:
      "Looks at character motivation, conflict, stakes, and emotional logic. Asks hard craft questions.",
  },
  structural: {
    label: "Structural",
    description:
      "Examines scene goals, causality, chapter turns, pacing architecture, and missing beats.",
  },
  voice_pass: {
    label: "Voice pass",
    description:
      "Checks diction, rhythm, POV leakage, and tonal consistency. Will not mimic another author.",
  },
  continuity: {
    label: "Continuity",
    description:
      "Finds contradictions across the text — timeline, facts, character details, and world rules.",
  },
  plotholes: {
    label: "Plotholes",
    description:
      "Hunts causal breaks, unanswered setups, and logic gaps that break immersion.",
  },
  lore_lock: {
    label: "Lore lock",
    description:
      "Compares the manuscript against your story bible and flags lore/rule contradictions.",
  },
  arcs: {
    label: "Arcs",
    description:
      "Tracks character and story arcs across full chapters in batches (exact text, no sampling). Whole-book runs charge per batch.",
  },
  promises: {
    label: "Promises",
    description:
      "Finds Chekhov’s guns and foreshadowing that may still need payoff.",
  },
  dialogue_fingerprint: {
    label: "Dialogue fingerprint",
    description:
      "Checks whether characters sound distinct, and flags when one voice bleeds into another.",
  },
  pacing: {
    label: "Pacing heatmap",
    description:
      "Estimates action vs reflection vs exposition balance so you can spot rushes and drags.",
  },
  voice_analysis: {
    label: "Voice analysis",
    description:
      "Profiles your authorial voice (diction, rhythm, POV habits) for awareness — not imitation targets.",
  },
  discover_comps: {
    label: "Discover comps",
    description:
      "Suggests comparable authors/books with reasons, for positioning — not for copying style.",
  },
  targeted_compare: {
    label: "Compare to…",
    description:
      "Compares craft to a target author or book you name. Highlights similarities and gaps without rewriting you as them.",
  },
  reading_list: {
    label: "Reading list",
    description:
      "Recommends books to study based on your content, POV, and voice.",
  },
  sensitivity: {
    label: "Sensitivity flags",
    description:
      "Optional advisory flags only. Never rewrites. You decide what to do with them.",
  },
  blurb_critique: {
    label: "Blurb critique",
    description:
      "Critiques marketing/blurb copy only — will not write a replacement blurb for you.",
  },
  beta_summary: {
    label: "Beta summary",
    description:
      "Summarizes themes in beta-reader feedback you paste or provide.",
  },
  custom_persona: {
    label: "Custom persona",
    description:
      "Runs critique through a persona you describe (e.g. ruthless developmental editor). Still never writes replacement prose.",
  },
  bible_extract: {
    label: "Bible extract",
    description:
      "Multi-pass scan over full chapter batches. Matches nicknames to existing entries, stores aliases, and can merge duplicates. Charges per AI pass.",
  },
};

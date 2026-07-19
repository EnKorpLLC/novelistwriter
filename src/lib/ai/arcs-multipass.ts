import { runCritiqueModel, parseAiJson, CRITIQUE_SYSTEM_PROMPT } from "@/lib/ai/critique";
import { computeCritiqueCost, type AiModelTier } from "@/lib/ai/pricing";
import {
  manuscriptFromBatch,
  packChaptersExact,
  type ChapterBatchRow,
} from "@/lib/ai/chapter-batches";

export type ArcTrackResult = {
  arc_type: "character" | "relationship" | "story" | string;
  subject: string;
  beats: unknown[];
  notes?: string;
};

export type ArcCritiqueItem = {
  severity: "must_fix" | "consider" | "style";
  confidence: number;
  category: string;
  title: string;
  body: string;
  citation_excerpt?: string;
  example_text?: string;
};

export const ARCS_CHAPTERS_PER_BATCH = 5;

export function packArcsBatches(chapters: ChapterBatchRow[]) {
  const ordered = [...chapters].sort((a, b) => a.sort_order - b.sort_order);
  return packChaptersExact(ordered, {
    maxCharsPerBatch: 80000,
    maxChaptersPerBatch: ARCS_CHAPTERS_PER_BATCH,
  }).filter((b) => b.some((c) => (c.content_text || "").trim()));
}

export function estimateArcsCost(opts: {
  chapterCount: number;
  model: AiModelTier;
  usingByok?: boolean;
  batches?: number;
}): { calls: number; cost: number; batches: number; perCall: number } {
  const chapterCount = Math.max(1, opts.chapterCount);
  const batches = opts.batches ?? Math.ceil(chapterCount / ARCS_CHAPTERS_PER_BATCH);
  const calls = Math.max(1, batches);
  if (opts.usingByok) {
    return { calls, cost: calls, batches: calls, perCall: 1 };
  }
  const perCall = computeCritiqueCost({
    jobType: "arcs",
    scope: "chapter",
    model: opts.model,
  });
  return { calls, cost: calls * perCall, batches: calls, perCall };
}

export function planArcsExtract(opts: {
  chapters: ChapterBatchRow[];
  model: AiModelTier;
  usingByok?: boolean;
}) {
  const batches = packArcsBatches(opts.chapters);
  const estimate = estimateArcsCost({
    chapterCount: opts.chapters.length,
    model: opts.model,
    usingByok: opts.usingByok,
    batches: Math.max(1, batches.length),
  });
  return {
    ...estimate,
    chapterCount: opts.chapters.length,
  };
}

/** One exact chapter batch — safe for a single serverless request. */
export async function runArcsUnit(opts: {
  chapters: ChapterBatchRow[];
  batchIndex: number;
  model: AiModelTier;
  byokAnthropic?: string | null;
  byokOpenAi?: string | null;
  level: number;
  prefs: unknown;
  bible: unknown[];
  priorSubjects?: string;
}): Promise<{
  arcs: ArcTrackResult[];
  items: ArcCritiqueItem[];
  summary: string;
  batchCount: number;
  batchLabel: string;
  empty: boolean;
}> {
  const batches = packArcsBatches(opts.chapters);
  if (!batches.length || opts.batchIndex < 0 || opts.batchIndex >= batches.length) {
    return {
      arcs: [],
      items: [],
      summary: "No chapters in this batch.",
      batchCount: batches.length,
      batchLabel: "",
      empty: true,
    };
  }

  const batch = batches[opts.batchIndex];
  const manuscript = manuscriptFromBatch(batch);
  const batchLabel =
    batch.length === 1
      ? batch[0].title
      : `${batch[0].title} → ${batch[batch.length - 1].title}`;

  const user = `Task: track character, relationship, and story arcs for this manuscript batch only (batch ${opts.batchIndex + 1}/${batches.length}: ${batchLabel}).

challenge_level: ${opts.level}
author_preferences: ${JSON.stringify(opts.prefs)}
story_bible: ${JSON.stringify(opts.bible).slice(0, 6000)}
${opts.priorSubjects ? `arcs_seen_so_far: ${opts.priorSubjects}` : ""}

HARD RULES:
- Read the FULL text of every chapter in this batch.
- Only cite what is evidenced in THIS batch.
- Continue existing arcs when the subject matches arcs_seen_so_far; otherwise start new ones.
- Keep critique items SHORT (max 5 items). Prefer extras.arcs over long items.
- Never write manuscript prose.
- Respond with RAW JSON only — no markdown, no code fences, no commentary before/after.
{
  "summary": string,
  "items": [{ "severity": "must_fix"|"consider"|"style", "confidence": 0-1, "category": string, "title": string, "body": string, "citation_excerpt"?: string }],
  "extras": {
    "arcs": [{ "arc_type": "character"|"relationship"|"story", "subject": string, "beats": [{ "chapter"?: string, "beat": string }], "notes"?: string }]
  }
}

MANUSCRIPT:
"""
${manuscript}
"""`;

  const raw = await runCritiqueModel({
    system: CRITIQUE_SYSTEM_PROMPT,
    user,
    byokAnthropic: opts.byokAnthropic,
    byokOpenAi: opts.byokOpenAi,
    modelTier: opts.model,
    maxTokens: 8192,
  });
  const parsed = parseAiJson(raw);
  const arcs = ((parsed.extras?.arcs || []) as ArcTrackResult[]).map((a) => ({
    ...a,
    arc_type:
      a.arc_type === "character" || a.arc_type === "relationship" ? a.arc_type : "story",
    subject: (a.subject || "").trim(),
    beats: Array.isArray(a.beats) ? a.beats : [],
    notes: a.notes || "",
  }));

  // Drop parse-error placeholders from failed JSON; keep real craft notes
  const items = ((parsed.items || []) as ArcCritiqueItem[]).filter(
    (i) => i.title !== "Parse error" && i.category !== "system"
  );

  return {
    arcs: arcs.filter((a) => a.subject),
    items,
    summary: parsed.summary || `Arcs: scanned ${batchLabel}`,
    batchCount: batches.length,
    batchLabel,
    empty: false,
  };
}

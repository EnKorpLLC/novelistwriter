import { runCritiqueModel, parseAiJson, CRITIQUE_SYSTEM_PROMPT } from "@/lib/ai/critique";
import { computeCritiqueCost, type AiModelTier } from "@/lib/ai/pricing";
import {
  manuscriptFromBatch,
  packChaptersExact,
  type ChapterBatchRow,
} from "@/lib/ai/chapter-batches";

export type BibleExtractEntry = {
  entry_type: "character" | "place" | "note" | "lore" | "rule" | "timeline";
  name: string;
  summary?: string;
  speech_notes?: string;
};

export type ChapterForExtract = ChapterBatchRow;

/** Soft max chapters per API call (exact packer may use fewer if chapters are long). */
export const BIBLE_CHAPTERS_PER_BATCH = 5;

export const BIBLE_PASSES: {
  id: string;
  label: string;
  types: BibleExtractEntry["entry_type"][];
  instruction: string;
}[] = [
  {
    id: "characters",
    label: "Characters",
    types: ["character"],
    instruction:
      "Extract EVERY named character (and clear recurring unnamed roles if important). Include speech/voice notes when evidenced. Prefer concrete names over vague labels.",
  },
  {
    id: "places",
    label: "Places",
    types: ["place"],
    instruction:
      "Extract EVERY named location, region, building, road, realm, or distinct setting. Note what happens there or why it matters when evidenced.",
  },
  {
    id: "lore_rules",
    label: "Lore & rules",
    types: ["lore", "rule"],
    instruction:
      "Extract world lore AND hard rules: magic systems, abilities, costs/limits, prophecies, religions, political laws, technology constraints, creature rules. Use entry_type lore for background myth/world facts and rule for enforceable constraints.",
  },
  {
    id: "timeline_notes",
    label: "Timeline & notes",
    types: ["timeline", "note"],
    instruction:
      "Extract timeline beats (when things happen relative to each other) and other bible-worthy notes that are not characters/places/rules (organizations, objects of power, debts, secrets as notes when not better as lore/rule).",
  },
];

export function getBiblePass(passId: string) {
  return BIBLE_PASSES.find((p) => p.id === passId) || null;
}

export function packBibleBatches(chapters: ChapterForExtract[]) {
  const ordered = [...chapters].sort((a, b) => a.sort_order - b.sort_order);
  return packChaptersExact(ordered, {
    maxCharsPerBatch: 90000,
    maxChaptersPerBatch: BIBLE_CHAPTERS_PER_BATCH,
  }).filter((b) => b.some((c) => (c.content_text || "").trim()));
}

/** Credits for a thorough multi-pass, full-chapter extract. */
export function estimateBibleExtractCost(opts: {
  chapterCount: number;
  model: AiModelTier;
  usingByok?: boolean;
  batches?: number;
}): { calls: number; cost: number; batches: number; perCall: number } {
  const chapterCount = Math.max(1, opts.chapterCount);
  const batches = opts.batches ?? Math.ceil(chapterCount / BIBLE_CHAPTERS_PER_BATCH);
  const calls = Math.max(1, batches) * BIBLE_PASSES.length;
  if (opts.usingByok) {
    return { calls, cost: calls, batches: Math.max(1, batches), perCall: 1 };
  }
  const perCall = computeCritiqueCost({
    jobType: "bible_extract",
    scope: "chapter",
    model: opts.model,
  });
  return { calls, cost: calls * perCall, batches: Math.max(1, batches), perCall };
}

export function planBibleExtract(opts: {
  chapters: ChapterForExtract[];
  model: AiModelTier;
  usingByok?: boolean;
}) {
  const batches = packBibleBatches(opts.chapters);
  const estimate = estimateBibleExtractCost({
    chapterCount: opts.chapters.length,
    model: opts.model,
    usingByok: opts.usingByok,
    batches: Math.max(1, batches.length),
  });
  return {
    ...estimate,
    chapterCount: opts.chapters.length,
    passes: BIBLE_PASSES.map((p) => ({ id: p.id, label: p.label })),
  };
}

/** One exact batch × one category pass — safe for a single serverless request. */
export async function runBibleExtractUnit(opts: {
  chapters: ChapterForExtract[];
  passId: string;
  batchIndex: number;
  model: AiModelTier;
  byokAnthropic?: string | null;
  byokOpenAi?: string | null;
  existingKeys: Set<string>;
}): Promise<{
  entries: BibleExtractEntry[];
  summary: string;
  batchCount: number;
  batchLabel: string;
  passLabel: string;
  empty: boolean;
}> {
  const pass = getBiblePass(opts.passId);
  if (!pass) {
    throw new Error(`Unknown bible pass: ${opts.passId}`);
  }

  const batches = packBibleBatches(opts.chapters);
  if (!batches.length || opts.batchIndex < 0 || opts.batchIndex >= batches.length) {
    return {
      entries: [],
      summary: "No chapters in this batch.",
      batchCount: batches.length,
      batchLabel: "",
      passLabel: pass.label,
      empty: true,
    };
  }

  const batch = batches[opts.batchIndex];
  const manuscript = manuscriptFromBatch(batch);
  const batchLabel =
    batch.length === 1
      ? batch[0].title
      : `${batch[0].title} → ${batch[batch.length - 1].title}`;

  const user = `Task: story-bible extraction pass "${pass.label}" (batch ${opts.batchIndex + 1}/${batches.length}: ${batchLabel}).

${pass.instruction}

HARD RULES:
- Read the FULL text of every chapter in this batch. Do not skip sections.
- Only extract what is evidenced in THIS manuscript batch.
- Do not invent entities.
- Never write manuscript prose or replacement scenes.
- Return JSON only:
{
  "summary": string,
  "items": [],
  "extras": {
    "entries": [{ "entry_type": ${pass.types.map((t) => `"${t}"`).join("|")}, "name": string, "summary"?: string, "speech_notes"?: string }]
  }
}
entry_type MUST be one of: ${pass.types.join(", ")}.

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
  });
  const parsed = parseAiJson(raw);
  const allowed = new Set(pass.types);
  const merged = new Map<string, BibleExtractEntry>();

  for (const e of (parsed.extras?.entries || []) as BibleExtractEntry[]) {
    if (!e?.name?.trim() || !allowed.has(e.entry_type)) continue;
    const key = `${e.entry_type}:${e.name.toLowerCase().trim()}`;
    if (opts.existingKeys.has(key) || merged.has(key)) continue;
    merged.set(key, {
      entry_type: e.entry_type,
      name: e.name.trim(),
      summary: e.summary || "",
      speech_notes: e.speech_notes || "",
    });
  }

  return {
    entries: [...merged.values()],
    summary: parsed.summary || `${pass.label}: scanned ${batchLabel}`,
    batchCount: batches.length,
    batchLabel,
    passLabel: pass.label,
    empty: false,
  };
}

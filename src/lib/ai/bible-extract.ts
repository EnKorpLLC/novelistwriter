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

export function bibleExtractCallCount(chapterCount: number): number {
  const n = Math.max(1, chapterCount);
  const batches = Math.ceil(n / BIBLE_CHAPTERS_PER_BATCH);
  return batches * BIBLE_PASSES.length;
}

/** Credits for a thorough multi-pass, full-chapter extract. */
export function estimateBibleExtractCost(opts: {
  chapterCount: number;
  model: AiModelTier;
  usingByok?: boolean;
}): { calls: number; cost: number; batches: number } {
  const chapterCount = Math.max(1, opts.chapterCount);
  const batches = Math.ceil(chapterCount / BIBLE_CHAPTERS_PER_BATCH);
  const calls = batches * BIBLE_PASSES.length;
  if (opts.usingByok) {
    return { calls, cost: calls, batches };
  }
  // One “chapter-scope” bible unit per API call (honest multi-request pricing)
  const perCall = computeCritiqueCost({
    jobType: "bible_extract",
    scope: "chapter",
    model: opts.model,
  });
  return { calls, cost: calls * perCall, batches };
}

function mergeEntries(
  into: Map<string, BibleExtractEntry>,
  incoming: BibleExtractEntry[],
  allowed: Set<string>
) {
  for (const e of incoming) {
    if (!e?.name?.trim() || !allowed.has(e.entry_type)) continue;
    const key = `${e.entry_type}:${e.name.toLowerCase().trim()}`;
    const prev = into.get(key);
    if (!prev) {
      into.set(key, {
        entry_type: e.entry_type,
        name: e.name.trim(),
        summary: e.summary || "",
        speech_notes: e.speech_notes || "",
      });
      continue;
    }
    // Enrich existing rather than drop later-chapter details
    const summary =
      (prev.summary || "").length >= (e.summary || "").length
        ? prev.summary
        : e.summary || prev.summary;
    const speech =
      (prev.speech_notes || "").length >= (e.speech_notes || "").length
        ? prev.speech_notes
        : e.speech_notes || prev.speech_notes;
    into.set(key, { ...prev, summary, speech_notes: speech });
  }
}

export async function runBibleExtractMultipass(opts: {
  chapters: ChapterForExtract[];
  model: AiModelTier;
  byokAnthropic?: string | null;
  byokOpenAi?: string | null;
  existingKeys: Set<string>;
}): Promise<{
  entries: BibleExtractEntry[];
  summary: string;
  calls: number;
  passSummaries: string[];
}> {
  const ordered = [...opts.chapters].sort((a, b) => a.sort_order - b.sort_order);
  const batches = packChaptersExact(ordered, {
    maxCharsPerBatch: 90000,
    maxChaptersPerBatch: BIBLE_CHAPTERS_PER_BATCH,
  }).filter((b) => b.some((c) => (c.content_text || "").trim()));
  const merged = new Map<string, BibleExtractEntry>();
  const passSummaries: string[] = [];
  let calls = 0;

  for (const pass of BIBLE_PASSES) {
    const allowed = new Set(pass.types);
    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const manuscript = manuscriptFromBatch(batch);

      if (!manuscript.trim()) continue;

      const chapterLabel =
        batch.length === 1
          ? batch[0].title
          : `${batch[0].title} → ${batch[batch.length - 1].title}`;

      const user = `Task: story-bible extraction pass "${pass.label}" (batch ${bi + 1}/${batches.length}: ${chapterLabel}).

${pass.instruction}

HARD RULES:
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
      calls += 1;
      const parsed = parseAiJson(raw);
      if (parsed.summary) passSummaries.push(`${pass.label} (${chapterLabel}): ${parsed.summary}`);
      const entries = (parsed.extras?.entries || []) as BibleExtractEntry[];
      mergeEntries(merged, entries, allowed);
    }
  }

  // Drop ones already in the project bible
  const fresh = [...merged.values()].filter(
    (e) => !opts.existingKeys.has(`${e.entry_type}:${e.name.toLowerCase().trim()}`)
  );

  const byType: Record<string, number> = {};
  for (const e of fresh) {
    byType[e.entry_type] = (byType[e.entry_type] || 0) + 1;
  }
  const tally = Object.entries(byType)
    .map(([t, n]) => `${n} ${t}${n === 1 ? "" : "s"}`)
    .join(", ");

  return {
    entries: fresh,
    summary: `Bible scan complete (${calls} AI passes over ${ordered.length} chapters). New entries: ${
      fresh.length ? tally : "none (everything found was already in your bible or nothing clear to add)"
    }.`,
    calls,
    passSummaries,
  };
}

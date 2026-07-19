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

export function estimateArcsCost(opts: {
  chapterCount: number;
  model: AiModelTier;
  usingByok?: boolean;
  /** Approximate batch count when chapter lengths unknown — uses max 5/batch. */
  batches?: number;
}): { calls: number; cost: number; batches: number } {
  const chapterCount = Math.max(1, opts.chapterCount);
  const batches = opts.batches ?? Math.ceil(chapterCount / 5);
  const calls = Math.max(1, batches);
  if (opts.usingByok) {
    return { calls, cost: calls, batches: calls };
  }
  const perCall = computeCritiqueCost({
    jobType: "arcs",
    scope: "chapter",
    model: opts.model,
  });
  return { calls, cost: calls * perCall, batches: calls };
}

function mergeArcs(into: Map<string, ArcTrackResult>, incoming: ArcTrackResult[]) {
  for (const a of incoming) {
    if (!a?.subject?.trim()) continue;
    const arcType =
      a.arc_type === "character" || a.arc_type === "relationship" ? a.arc_type : "story";
    const key = `${arcType}:${a.subject.toLowerCase().trim()}`;
    const prev = into.get(key);
    const beats = Array.isArray(a.beats) ? a.beats : [];
    if (!prev) {
      into.set(key, {
        arc_type: arcType,
        subject: a.subject.trim(),
        beats,
        notes: a.notes || "",
      });
      continue;
    }
    into.set(key, {
      ...prev,
      beats: [...(prev.beats || []), ...beats],
      notes: [prev.notes, a.notes].filter(Boolean).join(" ").trim() || prev.notes,
    });
  }
}

function mergeItems(into: ArcCritiqueItem[], incoming: ArcCritiqueItem[]) {
  const seen = new Set(into.map((i) => i.title.toLowerCase().trim()));
  for (const item of incoming) {
    if (!item?.title?.trim()) continue;
    const k = item.title.toLowerCase().trim();
    if (seen.has(k)) continue;
    seen.add(k);
    into.push(item);
  }
}

export async function runArcsMultipass(opts: {
  chapters: ChapterBatchRow[];
  model: AiModelTier;
  byokAnthropic?: string | null;
  byokOpenAi?: string | null;
  level: number;
  prefs: unknown;
  bible: unknown[];
}): Promise<{
  arcs: ArcTrackResult[];
  items: ArcCritiqueItem[];
  summary: string;
  calls: number;
  batches: number;
  batchSummaries: string[];
}> {
  const batches = packChaptersExact(opts.chapters, {
    maxCharsPerBatch: 90000,
    maxChaptersPerBatch: 5,
  }).filter((b) => b.some((c) => (c.content_text || "").trim()));

  const arcsMap = new Map<string, ArcTrackResult>();
  const items: ArcCritiqueItem[] = [];
  const batchSummaries: string[] = [];
  let calls = 0;

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const manuscript = manuscriptFromBatch(batch);
    if (!manuscript.trim()) continue;

    const chapterLabel =
      batch.length === 1
        ? batch[0].title
        : `${batch[0].title} → ${batch[batch.length - 1].title}`;

    const priorSubjects = [...arcsMap.values()]
      .map((a) => `${a.arc_type}:${a.subject}`)
      .slice(0, 40)
      .join("; ");

    const user = `Task: track character, relationship, and story arcs for this manuscript batch only (batch ${bi + 1}/${batches.length}: ${chapterLabel}).

challenge_level: ${opts.level}
author_preferences: ${JSON.stringify(opts.prefs)}
story_bible: ${JSON.stringify(opts.bible).slice(0, 8000)}
${priorSubjects ? `arcs_seen_so_far: ${priorSubjects}` : ""}

HARD RULES:
- Read the FULL text of every chapter in this batch. Do not skip or summarize away beats.
- Only cite what is evidenced in THIS batch.
- Continue existing arcs when the subject matches arcs_seen_so_far; otherwise start new ones.
- Never write manuscript prose or replacement scenes.
- Return JSON only:
{
  "summary": string,
  "items": [{ "severity": "must_fix"|"consider"|"style", "confidence": 0-1, "category": string, "title": string, "body": string, "citation_excerpt"?: string, "example_text"?: string }],
  "extras": {
    "arcs": [{ "arc_type": "character"|"relationship"|"story", "subject": string, "beats": [{ "chapter"?: string, "beat": string, "status"?: string }], "notes"?: string }]
  }
}

MANUSCRIPT (full chapters in this batch):
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
    if (parsed.summary) {
      batchSummaries.push(`${chapterLabel}: ${parsed.summary}`);
    }
    const arcs = (parsed.extras?.arcs || []) as ArcTrackResult[];
    mergeArcs(arcsMap, arcs);
    mergeItems(items, (parsed.items || []) as ArcCritiqueItem[]);
  }

  const arcs = [...arcsMap.values()];
  const summary = `Arc scan complete (${calls} AI passes over ${opts.chapters.length} chapters, full text). Tracked ${arcs.length} arc(s). ${
    batchSummaries[0] || ""
  }`.trim();

  return {
    arcs,
    items,
    summary,
    calls,
    batches: batches.length,
    batchSummaries,
  };
}

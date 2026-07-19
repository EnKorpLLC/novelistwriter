import { runCritiqueModel, parseAiJson, CRITIQUE_SYSTEM_PROMPT } from "@/lib/ai/critique";
import { computeCritiqueCost, type AiModelTier } from "@/lib/ai/pricing";
import {
  manuscriptFromBatch,
  packChaptersExact,
  type ChapterBatchRow,
} from "@/lib/ai/chapter-batches";
import {
  aliasesOf,
  clusterEntriesForMerge,
  findMatchingCatalogEntry,
  mergeAliasLists,
  preferCanonicalName,
  preferRicherText,
  type BibleCatalogEntry,
} from "@/lib/ai/bible-match";

export type BibleExtractEntry = {
  entry_type: "character" | "place" | "note" | "lore" | "rule" | "timeline";
  name: string;
  summary?: string;
  speech_notes?: string;
  aliases?: string[];
  match_id?: string | null;
};

export type BibleExtractUpdate = {
  id: string;
  entry_type: BibleExtractEntry["entry_type"];
  name: string;
  summary: string;
  speech_notes: string;
  aliases: string[];
};

export type ChapterForExtract = ChapterBatchRow;

/**
 * Soft max chapters per API call. Key issue fixed — larger batches OK.
 * Still chunked so the user can stop and so Vercel stays reliable.
 */
export const BIBLE_CHAPTERS_PER_BATCH = 8;
export const BIBLE_MAX_CHARS_PER_BATCH = 80000;

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
      "Extract EVERY named character (and clear recurring unnamed roles if important). Include speech/voice notes when evidenced. Prefer the fullest formal name as `name`, and put nicknames/titles/short forms in `aliases` (e.g. name: \"Lady Sera Beaufort\", aliases: [\"Sera\", \"Lady Beaufort\"]).",
  },
  {
    id: "places",
    label: "Places",
    types: ["place"],
    instruction:
      "Extract EVERY named location, region, building, road, realm, or distinct setting. Prefer the fullest place name; put short forms in aliases.",
  },
  {
    id: "lore_rules",
    label: "Lore & rules",
    types: ["lore", "rule"],
    instruction:
      "Extract world lore AND hard rules: magic systems, abilities, costs/limits, prophecies, religions, political laws, technology constraints, creature rules. Use entry_type lore for background myth/world facts and rule for enforceable constraints. Prefer one canonical name; aliases for alternate labels.",
  },
  {
    id: "timeline_notes",
    label: "Timeline & notes",
    types: ["timeline", "note"],
    instruction:
      "Extract timeline beats and other bible-worthy notes (organizations, objects of power, debts, secrets as notes when not better as lore/rule). Prefer canonical names with aliases for variants.",
  },
];

export function getBiblePass(passId: string) {
  return BIBLE_PASSES.find((p) => p.id === passId) || null;
}

export function packBibleBatches(chapters: ChapterForExtract[]) {
  const ordered = [...chapters].sort((a, b) => a.sort_order - b.sort_order);
  return packChaptersExact(ordered, {
    maxCharsPerBatch: BIBLE_MAX_CHARS_PER_BATCH,
    maxChaptersPerBatch: BIBLE_CHAPTERS_PER_BATCH,
  }).filter((b) => b.some((c) => (c.content_text || "").trim()));
}

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

export function estimateBibleMergeCost(_opts?: {
  model?: AiModelTier;
  usingByok?: boolean;
  typeCount?: number;
}): { calls: number; cost: number; perCall: number } {
  // Local clustering — no AI calls
  return { calls: 0, cost: 0, perCall: 0 };
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

function catalogSnippet(catalog: BibleCatalogEntry[], types: string[]): string {
  const rows = catalog
    .filter((c) => types.includes(c.entry_type))
    .slice(0, 120)
    .map((c) => {
      const als = aliasesOf(c).filter((a) => a !== c.name);
      return `- id=${c.id} type=${c.entry_type} name=${JSON.stringify(c.name)}${
        als.length ? ` aliases=${JSON.stringify(als)}` : ""
      }`;
    });
  return rows.length ? rows.join("\n") : "(none yet)";
}

/** One exact batch × one category pass — upserts into existing when aliases match. */
export async function runBibleExtractUnit(opts: {
  chapters: ChapterForExtract[];
  passId: string;
  batchIndex: number;
  model: AiModelTier;
  byokAnthropic?: string | null;
  byokOpenAi?: string | null;
  catalog: BibleCatalogEntry[];
}): Promise<{
  inserts: BibleExtractEntry[];
  updates: BibleExtractUpdate[];
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
      inserts: [],
      updates: [],
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

EXISTING ENTRIES for this project (MUST reuse when the same person/place/thing appears under a nickname, title, or short form):
${catalogSnippet(opts.catalog, pass.types)}

HARD RULES:
- Read the FULL text of every chapter in this batch. Do not skip sections.
- Only extract what is evidenced in THIS manuscript batch.
- If an entity matches an existing entry (same person as "Sera" / "Lady Beaufort" / "Lady Sera Beaufort"), set match_id to that entry's id and deepen summary/speech_notes/aliases — do NOT invent a separate entry.
- Prefer the fullest formal name as name; put nicknames/titles in aliases.
- Do not invent entities.
- Never write manuscript prose or replacement scenes.
- Return JSON only:
{
  "summary": string,
  "items": [],
  "extras": {
    "entries": [{
      "entry_type": ${pass.types.map((t) => `"${t}"`).join("|")},
      "name": string,
      "summary"?: string,
      "speech_notes"?: string,
      "aliases"?: string[],
      "match_id"?: string | null
    }]
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
  const inserts: BibleExtractEntry[] = [];
  const updates: BibleExtractUpdate[] = [];
  const seenInsert = new Set<string>();
  const seenUpdate = new Set<string>();
  // Working catalog so later rows in the same response can match earlier inserts conceptually
  const working = [...opts.catalog];

  for (const e of (parsed.extras?.entries || []) as BibleExtractEntry[]) {
    if (!e?.name?.trim() || !allowed.has(e.entry_type)) continue;
    const aliases = mergeAliasLists(e.aliases, [e.name]);
    const match = findMatchingCatalogEntry(working, {
      entry_type: e.entry_type,
      name: e.name,
      aliases,
      match_id: e.match_id,
    });

    if (match) {
      if (seenUpdate.has(match.id)) continue;
      seenUpdate.add(match.id);
      const nextName = preferCanonicalName(match.name, e.name.trim());
      const nextAliases = mergeAliasLists(aliasesOf(match), aliases, [nextName]).filter(
        (a) => normalizeCmp(a) !== normalizeCmp(nextName)
      );
      const upd: BibleExtractUpdate = {
        id: match.id,
        entry_type: e.entry_type,
        name: nextName,
        summary: preferRicherText(match.summary, e.summary),
        speech_notes: preferRicherText(match.speech_notes, e.speech_notes),
        aliases: nextAliases,
      };
      updates.push(upd);
      // Refresh working catalog entry
      const idx = working.findIndex((w) => w.id === match.id);
      if (idx >= 0) {
        working[idx] = {
          ...working[idx],
          name: upd.name,
          summary: upd.summary,
          speech_notes: upd.speech_notes,
          details: { ...(working[idx].details || {}), aliases: upd.aliases },
        };
      }
      continue;
    }

    const key = `${e.entry_type}:${normalizeCmp(e.name)}`;
    if (seenInsert.has(key)) continue;
    seenInsert.add(key);
    const row: BibleExtractEntry = {
      entry_type: e.entry_type,
      name: e.name.trim(),
      summary: e.summary || "",
      speech_notes: e.speech_notes || "",
      aliases: aliases.filter((a) => normalizeCmp(a) !== normalizeCmp(e.name)),
    };
    inserts.push(row);
    working.push({
      id: `pending:${key}`,
      entry_type: row.entry_type,
      name: row.name,
      summary: row.summary,
      speech_notes: row.speech_notes,
      details: { aliases: row.aliases },
    });
  }

  return {
    inserts,
    updates,
    summary: parsed.summary || `${pass.label}: scanned ${batchLabel}`,
    batchCount: batches.length,
    batchLabel,
    passLabel: pass.label,
    empty: false,
  };
}

function normalizeCmp(s: string) {
  return s.toLowerCase().trim();
}

export type BibleMergeAction = {
  keep_id: string;
  merge_ids: string[];
  name: string;
  summary: string;
  speech_notes: string;
  aliases: string[];
};

/** Consolidate duplicate entries of one type via local name/alias clustering (not a shy AI pass). */
export async function runBibleMergeUnit(opts: {
  entryType: BibleExtractEntry["entry_type"];
  catalog: BibleCatalogEntry[];
  model: AiModelTier;
  byokAnthropic?: string | null;
  byokOpenAi?: string | null;
}): Promise<{ actions: BibleMergeAction[]; summary: string; method: "local" }> {
  const rows = opts.catalog.filter((c) => c.entry_type === opts.entryType);
  if (rows.length < 2) {
    return {
      actions: [],
      summary: `No duplicates to merge for ${opts.entryType}.`,
      method: "local",
    };
  }

  const clusters = clusterEntriesForMerge(rows);
  const actions: BibleMergeAction[] = clusters.map((c) => ({
    keep_id: c.keep.id,
    merge_ids: c.merge.map((m) => m.id),
    name: c.name,
    summary: c.summary,
    speech_notes: c.speech_notes,
    aliases: c.aliases,
  }));

  const removed = actions.reduce((n, a) => n + a.merge_ids.length, 0);
  return {
    actions,
    summary: `Local merge for ${opts.entryType}: ${actions.length} group(s), removing ${removed} duplicate row(s) from ${rows.length}.`,
    method: "local",
  };
}

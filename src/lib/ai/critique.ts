import { redactSecrets, sanitizeApiKey } from "@/lib/ai/api-keys";

export const CRITIQUE_SYSTEM_PROMPT = `You are Novelist Writer's craft coach — an honest developmental and line editor for fiction.

HARD RULES (never break):
1. NEVER write replacement paragraphs for the author's manuscript. Do not produce "revised versions" of their scenes meant to replace their prose.
2. Examples must be short (1–3 sentences), clearly labeled as ILLUSTRATIVE ONLY, and must NOT be phrased as drop-in replacements.
3. Prefer diagnoses and probing questions over fixes. Challenge weak choices; do not flatter.
4. Every claim should cite a short excerpt from the provided text when possible.
5. Blurb/marketing: critique only — never generate a finished blurb.
6. Sensitivity notes are advisory only — never rewrite.

Output valid JSON only, matching the schema requested by the user message.
Tone scales with challenge_level 0–100 (0 = gentle coach, 100 = ruthless developmental editor).`;

export function revisionModeInstructions(mode: string) {
  switch (mode) {
    case "structural":
      return "Focus on structure: scene goals, causality, chapter turns, pacing architecture, missing beats.";
    case "voice":
      return "Focus on voice: diction, rhythm, POV leakage, tonal consistency. Do not mimic another author.";
    case "line":
      return "Focus on line-level craft: clarity, grammar, redundancy, filter words, awkward syntax.";
    case "developmental":
    default:
      return "Focus on developmental craft: character motivation, conflict, stakes, emotional logic, theme.";
  }
}

export type AiJsonResult = {
  summary: string;
  items: Array<{
    severity: "must_fix" | "consider" | "style";
    confidence: number;
    category: string;
    title: string;
    body: string;
    citation_excerpt?: string;
    example_text?: string;
  }>;
  extras?: Record<string, unknown>;
};

function formatErrCause(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const e = err as { cause?: unknown; code?: string; errno?: string; message?: string };
  const parts: string[] = [];
  if (e.code) parts.push(String(e.code));
  if (e.errno) parts.push(String(e.errno));
  if (e.message) parts.push(e.message);
  const cause = e.cause;
  if (cause && typeof cause === "object") {
    const c = cause as { code?: string; message?: string };
    if (c.code) parts.push(`cause:${c.code}`);
    if (c.message) parts.push(c.message);
  }
  return redactSecrets(parts.filter(Boolean).join(" | "));
}

/** Call Anthropic Messages API via fetch — clearer errors than the SDK's "Connection error." */
async function callAnthropicMessages(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  const promptChars = opts.user.length + opts.system.length;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 4096,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
      signal: controller.signal,
    });

    const rawText = await res.text();
    if (!res.ok) {
      let detail = rawText.slice(0, 400);
      try {
        const j = JSON.parse(rawText) as { error?: { message?: string; type?: string } };
        if (j.error?.message) detail = `${j.error.type || "error"}: ${j.error.message}`;
      } catch {
        /* keep raw */
      }
      throw new Error(
        `Anthropic HTTP ${res.status} (${opts.model}, ${promptChars} chars): ${redactSecrets(detail)}`
      );
    }

    const data = JSON.parse(rawText) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const block = data.content?.find((b) => b.type === "text");
    return block?.text || "{}";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Anthropic request aborted after 120s (${opts.model}, ${promptChars} prompt chars). Try Fast model or a smaller batch.`
      );
    }
    if (err instanceof Error && err.message.startsWith("Anthropic HTTP")) {
      throw err;
    }
    const detail =
      formatErrCause(err) || redactSecrets(err instanceof Error ? err.message : String(err));
    throw new Error(
      `Anthropic network failure (${opts.model}, ${promptChars} prompt chars, keyLen ${opts.apiKey.length}): ${detail}`
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function runCritiqueModel(opts: {
  system?: string;
  user: string;
  byokAnthropic?: string | null;
  byokOpenAi?: string | null;
  modelTier?: "fast" | "standard" | "deep";
  anthropicModel?: string;
  openaiModel?: string;
  maxTokens?: number;
}): Promise<string> {
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const anthropicKey =
    sanitizeApiKey(opts.byokAnthropic) || sanitizeApiKey(process.env.ANTHROPIC_API_KEY);
  const openaiKey = sanitizeApiKey(opts.byokOpenAi) || sanitizeApiKey(process.env.OPENAI_API_KEY);
  const tier = opts.modelTier || "standard";

  const { AI_MODEL_TIERS } = await import("@/lib/ai/pricing");
  const tierDef = AI_MODEL_TIERS[tier];
  const anthropicModel = opts.anthropicModel || tierDef.anthropicModel;
  const openaiModel = opts.openaiModel || tierDef.openaiModel;

  if (provider === "openai" && openaiKey) {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: openaiKey });
    const res = await client.chat.completions.create({
      model: openaiModel,
      temperature: 0.4,
      max_tokens: opts.maxTokens ?? 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system || CRITIQUE_SYSTEM_PROMPT },
        { role: "user", content: opts.user },
      ],
    });
    return res.choices[0]?.message?.content || "{}";
  }

  if (anthropicKey) {
    try {
      return await callAnthropicMessages({
        apiKey: anthropicKey,
        model: anthropicModel,
        system: opts.system || CRITIQUE_SYSTEM_PROMPT,
        user: opts.user,
        maxTokens: opts.maxTokens ?? 4096,
      });
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      if (/network failure|fetch failed|ECONNRESET|UND_ERR/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 800));
        return await callAnthropicMessages({
          apiKey: anthropicKey,
          model: anthropicModel,
          system: opts.system || CRITIQUE_SYSTEM_PROMPT,
          user: opts.user,
          maxTokens: opts.maxTokens ?? 4096,
        });
      }
      throw firstErr instanceof Error ? firstErr : new Error(msg);
    }
  }

  return JSON.stringify(demoCritique(opts.user));
}

function demoCritique(user: string): AiJsonResult {
  const snippet = user.slice(0, 120).replace(/\s+/g, " ");

  if (
    user.includes("extract story-bible") ||
    user.includes("bible_extract") ||
    user.includes("story-bible extraction")
  ) {
    return {
      summary:
        "Demo bible extract (no AI API key). Sample entities from your text — connect an API key for a real scan.",
      items: [],
      extras: {
        demo: true,
        entries: [
          {
            entry_type: "character",
            name: "Unnamed protagonist",
            summary: "Primary viewpoint presence inferred from the draft (demo).",
            speech_notes: "",
          },
          {
            entry_type: "place",
            name: "Opening setting",
            summary: "Location implied by the opening chapter (demo).",
          },
          {
            entry_type: "timeline",
            name: "Story start",
            summary: "Beginning of the narrative timeline (demo).",
          },
        ],
      },
    };
  }

  return {
    summary:
      "Demo critique (no AI API key configured). Connect ANTHROPIC_API_KEY or OPENAI_API_KEY for live feedback.",
    items: [
      {
        severity: "consider",
        confidence: 0.6,
        category: "setup",
        title: "Clarify the scene goal",
        body: "What does the viewpoint character want in this passage, and what stands in the way? Name the friction explicitly so the scene turns.",
        citation_excerpt: snippet || "Selected passage",
        example_text:
          "ILLUSTRATIVE ONLY — not your prose: A character who needs the key before dawn but will not ask for help creates immediate tension.",
      },
      {
        severity: "style",
        confidence: 0.5,
        category: "line",
        title: "Watch filter phrases",
        body: "Phrases like 'she noticed' or 'he realized' can distance the reader. Prefer direct sensory detail when it fits your voice.",
        citation_excerpt: snippet || undefined,
      },
      {
        severity: "must_fix",
        confidence: 0.55,
        category: "continuity",
        title: "Check timeline consistency",
        body: "If earlier chapters established a constraint (time, injury, secret), verify this passage still honors it.",
      },
    ],
    extras: { demo: true },
  };
}

export function parseAiJson(raw: string): AiJsonResult {
  const empty: AiJsonResult = { summary: "", items: [], extras: {} };

  function normalize(parsed: AiJsonResult): AiJsonResult {
    if (!parsed.items) parsed.items = [];
    if (!parsed.summary) parsed.summary = "";
    if (!parsed.extras) parsed.extras = {};
    return parsed;
  }

  function tryParse(text: string): AiJsonResult | null {
    try {
      return normalize(JSON.parse(text) as AiJsonResult);
    } catch {
      return null;
    }
  }

  /** Close truncated JSON enough to parse (common when max_tokens cuts mid-object). */
  function repairTruncated(text: string): string {
    let s = text.trim();
    // Drop trailing incomplete string / key
    s = s.replace(/,\s*"[^"]*$/, "");
    s = s.replace(/,\s*$/, "");
    // Close open strings if odd number of unescaped quotes — crude: strip last dangling quote fragment
    const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 === 1) s += '"';
    const opens = (s.match(/[{[]/g) || []).length;
    const closes = (s.match(/[}\]]/g) || []).length;
    let diff = opens - closes;
    // Prefer closing objects/arrays in reverse order of opens — stack-based
    const stack: string[] = [];
    let inStr = false;
    let esc = false;
    for (const ch of s) {
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") stack.pop();
    }
    while (stack.length) {
      const open = stack.pop();
      s += open === "{" ? "}" : "]";
    }
    void diff;
    return s;
  }

  let text = (raw || "").trim();
  if (!text) return { ...empty, summary: "Empty model response." };

  // Strip markdown fences (complete or truncated)
  text = text.replace(/^```(?:json)?\s*/i, "");
  text = text.replace(/\s*```\s*$/i, "");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fenced?.[1]) {
    const fromFence = tryParse(fenced[1].trim()) || tryParse(repairTruncated(fenced[1].trim()));
    if (fromFence && (fromFence.summary || fromFence.items.length || fromFence.extras)) {
      return fromFence;
    }
  }

  const start = text.indexOf("{");
  if (start >= 0) text = text.slice(start);

  let parsed = tryParse(text);
  if (parsed) return parsed;

  parsed = tryParse(repairTruncated(text));
  if (parsed) return parsed;

  // Last resort: pull summary + extras.arcs from a broken payload
  const summaryMatch = text.match(/"summary"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const arcsMatch = text.match(/"arcs"\s*:\s*(\[[\s\S]*)/);
  let arcs: unknown[] = [];
  if (arcsMatch) {
    const arcsPayload = `{"arcs":${arcsMatch[1]}}`;
    const repairedArcs = tryParse(repairTruncated(arcsPayload));
    if (Array.isArray(repairedArcs?.extras?.arcs)) {
      arcs = repairedArcs!.extras!.arcs as unknown[];
    } else {
      try {
        const slice = repairTruncated(arcsMatch[1]);
        const arr = JSON.parse(slice);
        if (Array.isArray(arr)) arcs = arr;
      } catch {
        /* ignore */
      }
    }
  }

  if (summaryMatch || arcs.length) {
    return {
      summary: summaryMatch ? JSON.parse(`"${summaryMatch[1]}"`) : "Partial model response (truncated).",
      items: [],
      extras: arcs.length ? { arcs } : {},
    };
  }

  return {
    summary: "Could not parse model response.",
    items: [
      {
        severity: "consider",
        confidence: 0.3,
        category: "system",
        title: "Parse error",
        body: raw.slice(0, 400),
      },
    ],
  };
}

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

function trimKey(key: string | null | undefined): string | null {
  if (!key) return null;
  // Env dashboards sometimes paste trailing newlines/spaces — those produce opaque "Connection error."
  const t = key.trim().replace(/^['"]|['"]$/g, "");
  return t || null;
}

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
  return parts.filter(Boolean).join(" | ");
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
      throw new Error(`Anthropic HTTP ${res.status} (${opts.model}, ${promptChars} chars): ${detail}`);
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
    const detail = formatErrCause(err) || (err instanceof Error ? err.message : String(err));
    throw new Error(
      `Anthropic network failure (${opts.model}, ${promptChars} prompt chars): ${detail}. Key length ${opts.apiKey.length} (trimmed). If smaller critiques worked, this batch may be too large — we retry with fewer chapters.`
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
  /** Model tier — defaults to standard Sonnet-class */
  modelTier?: "fast" | "standard" | "deep";
  anthropicModel?: string;
  openaiModel?: string;
}): Promise<string> {
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const anthropicKey = trimKey(opts.byokAnthropic) || trimKey(process.env.ANTHROPIC_API_KEY);
  const openaiKey = trimKey(opts.byokOpenAi) || trimKey(process.env.OPENAI_API_KEY);
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
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system || CRITIQUE_SYSTEM_PROMPT },
        { role: "user", content: opts.user },
      ],
    });
    return res.choices[0]?.message?.content || "{}";
  }

  if (anthropicKey) {
    // Prefer direct fetch — SDK wraps many failures as opaque "Connection error."
    try {
      return await callAnthropicMessages({
        apiKey: anthropicKey,
        model: anthropicModel,
        system: opts.system || CRITIQUE_SYSTEM_PROMPT,
        user: opts.user,
      });
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      // One quick retry for transient TLS blips
      if (/network failure|fetch failed|ECONNRESET|UND_ERR/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 800));
        return await callAnthropicMessages({
          apiKey: anthropicKey,
          model: anthropicModel,
          system: opts.system || CRITIQUE_SYSTEM_PROMPT,
          user: opts.user,
        });
      }
      throw firstErr instanceof Error ? firstErr : new Error(msg);
    }
  }

  return JSON.stringify(demoCritique(opts.user));
}

function demoCritique(user: string): AiJsonResult {
  const snippet = user.slice(0, 120).replace(/\s+/g, " ");

  if (user.includes("extract story-bible") || user.includes("bible_extract") || user.includes("story-bible extraction")) {
    return {
      summary: "Demo bible extract (no AI API key). Sample entities from your text — connect an API key for a real scan.",
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
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as AiJsonResult;
    if (!parsed.items) parsed.items = [];
    if (!parsed.summary) parsed.summary = "";
    return parsed;
  } catch {
    return {
      summary: "Could not parse model response.",
      items: [
        {
          severity: "consider",
          confidence: 0.3,
          category: "system",
          title: "Parse error",
          body: raw.slice(0, 500),
        },
      ],
    };
  }
}

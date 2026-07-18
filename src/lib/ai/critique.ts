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

export function revisionModeInstructions(mode: string): string {
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

export async function runCritiqueModel(opts: {
  system?: string;
  user: string;
  byokAnthropic?: string | null;
  byokOpenAi?: string | null;
}): Promise<string> {
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const anthropicKey = opts.byokAnthropic || process.env.ANTHROPIC_API_KEY;
  const openaiKey = opts.byokOpenAi || process.env.OPENAI_API_KEY;

  if (provider === "openai" && openaiKey) {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: openaiKey });
    const res = await client.chat.completions.create({
      model: "gpt-4o",
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
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: anthropicKey });
    // claude-sonnet-4-20250514 retired June 2026 — default to Sonnet 4.6
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system: opts.system || CRITIQUE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: opts.user }],
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "{}";
  }

  // Deterministic demo fallback when no API keys configured
  return JSON.stringify(demoCritique(opts.user));
}

function demoCritique(user: string): AiJsonResult {
  const snippet = user.slice(0, 120).replace(/\s+/g, " ");

  if (user.includes("extract story-bible") || user.includes("bible_extract")) {
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

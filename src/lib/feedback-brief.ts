/**
 * RX4: what the author wants from beta readers, shown before readers apply, and the guided questions
 * that make honest feedback easier to give kindly. Safe on client and server.
 */

export const FEEDBACK_FOCUS = [
  { id: "big_picture", label: "Big picture: does the story work?" },
  { id: "characters", label: "Characters" },
  { id: "pacing", label: "Pacing: where it drags or rushes" },
  { id: "world", label: "Worldbuilding and setting" },
  { id: "dialogue", label: "Dialogue" },
  { id: "line", label: "Typos and line-level polish" },
] as const;

export const DRAFT_STAGES = [
  { id: "first", label: "First draft", note: "Rough. Expect typos and loose ends; story-level notes help most." },
  { id: "revised", label: "Revised draft", note: "Rewritten at least once. The story is in place; details are still moving." },
  { id: "polish", label: "Final polish", note: "Nearly done. Small things matter now, typos included." },
] as const;

export type FeedbackBrief = { focus: string[]; stage: string; time: string };

export function normalizeBrief(raw: unknown): FeedbackBrief | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const focus = (Array.isArray(o.focus) ? o.focus : []).map(String).filter((f) => FEEDBACK_FOCUS.some((x) => x.id === f));
  const stage = DRAFT_STAGES.some((s) => s.id === o.stage) ? String(o.stage) : "";
  const time = typeof o.time === "string" ? o.time.trim().slice(0, 160) : "";
  return focus.length || stage || time ? { focus, stage, time } : null;
}

export function focusLabel(id: string) {
  return FEEDBACK_FOCUS.find((f) => f.id === id)?.label || id;
}

export function stageInfo(id: string) {
  return DRAFT_STAGES.find((s) => s.id === id) || null;
}

const CHAPTER_PROMPTS: Record<string, string[]> = {
  general: ["What made you want to keep reading?", "Where did you lose interest, if anywhere?", "Was anything confusing?"],
  big_picture: ["Did this chapter move the story forward for you?", "What do you think happens next?"],
  characters: ["Which character felt most real here? Which felt flat?", "Did anyone do something that felt out of character?"],
  pacing: ["Did any part drag, or feel rushed?", "Where did you skim, if anywhere?"],
  world: ["Was anything about the world or setting hard to follow?", "Did the setting feel vivid?"],
  dialogue: ["Did any line of dialogue sound off, or like the wrong person said it?"],
  line: ["Spot any typos or clunky sentences? Highlight them above."],
};

/** Questions under each chapter, starting with what the author asked for. */
export function chapterPrompts(brief: FeedbackBrief | null): string[] {
  const asked = (brief?.focus || []).flatMap((f) => CHAPTER_PROMPTS[f] || []);
  return [...new Set([...asked, ...CHAPTER_PROMPTS.general])].slice(0, 5);
}

/** Questions for the final review. */
export const FINAL_PROMPTS = [
  "What will you remember about this book?",
  "What was the strongest part? The weakest?",
  "Who would you recommend it to?",
];

/** A reader can use these openings to say something hard, kindly. */
export const KIND_OPENERS = ["I loved…, and I wished…", "I got lost when…", "I stopped believing it when…", "This made me feel…"];

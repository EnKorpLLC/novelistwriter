/** Build manuscript text for AI jobs with per-job size limits. */

type ChapterRow = { title: string; content_text: string | null; sort_order?: number };

function clip(text: string, max: number) {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…[truncated]`;
}

/**
 * For full-book jobs (esp. bible extract), sample every chapter instead of
 * dumping only the start of the novel until a char limit.
 */
export function buildBookManuscript(
  chapters: ChapterRow[],
  opts?: { jobType?: string; maxChars?: number }
): string {
  const job = opts?.jobType || "";
  const maxChars = opts?.maxChars ?? (job === "bible_extract" ? 48000 : 90000);

  if (!chapters.length) return "";

  // Even budget across chapters so late cast/world still appears
  const perChapter = Math.max(400, Math.floor(maxChars / chapters.length) - 40);
  const parts: string[] = [];
  let used = 0;

  for (const c of chapters) {
    const body = clip(c.content_text || "", perChapter);
    const block = `## ${c.title}\n${body}`;
    if (used + block.length + 2 > maxChars) {
      const room = maxChars - used - 20;
      if (room > 100) {
        parts.push(clip(block, room));
      }
      break;
    }
    parts.push(block);
    used += block.length + 2;
  }

  return parts.join("\n\n");
}

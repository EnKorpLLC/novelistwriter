/** Exact chapter packing for multipass book jobs — never truncates chapter text. */

export type ChapterBatchRow = {
  title: string;
  content_text: string;
  sort_order: number;
};

export function chapterBlock(c: ChapterBatchRow): string {
  return `## ${c.title}\n${(c.content_text || "").trim()}`;
}

/**
 * Pack chapters into batches without truncating any chapter.
 * Soft limits: maxCharsPerBatch and maxChaptersPerBatch.
 * A single oversized chapter is still sent alone in full.
 */
export function packChaptersExact(
  chapters: ChapterBatchRow[],
  opts?: { maxCharsPerBatch?: number; maxChaptersPerBatch?: number }
): ChapterBatchRow[][] {
  const maxChars = opts?.maxCharsPerBatch ?? 90000;
  const maxChapters = opts?.maxChaptersPerBatch ?? 5;
  const ordered = [...chapters].sort((a, b) => a.sort_order - b.sort_order);
  const batches: ChapterBatchRow[][] = [];
  let current: ChapterBatchRow[] = [];
  let used = 0;

  for (const c of ordered) {
    const block = chapterBlock(c);
    const nextLen = used + (current.length ? 2 : 0) + block.length;
    const wouldOverflow =
      current.length > 0 &&
      (current.length >= maxChapters || nextLen > maxChars);

    if (wouldOverflow) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push(c);
    used += (current.length > 1 ? 2 : 0) + block.length;
  }

  if (current.length) batches.push(current);
  return batches.length ? batches : [[]];
}

export function manuscriptFromBatch(batch: ChapterBatchRow[]): string {
  return batch.map(chapterBlock).join("\n\n");
}

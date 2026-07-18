/** Novelist 2.0–style DOCX: title, Contents, then "Chapter N: Title" sections */

export type ParsedDocxProject = {
  title: string;
  chapters: { title: string; body: string; number: number }[];
};

const CHAPTER_SPLIT = /\n(?=Chapter\s+\d+\s*:)/i;
const CHAPTER_HEAD = /^Chapter\s+(\d+)\s*:\s*(.*)$/i;

export function parseNovelist2DocxText(raw: string): ParsedDocxProject {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const parts = text.split(CHAPTER_SPLIT);

  let title = "Untitled Novel";
  const preamble = parts[0] || "";
  const preambleLines = preamble
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // First non-"Contents" line is the book title
  for (const line of preambleLines) {
    if (/^contents$/i.test(line)) continue;
    title = line;
    break;
  }

  const chapterParts = parts.slice(1);
  // If file didn't use "Chapter N:" but still has content after Contents
  if (!chapterParts.length && preamble) {
    const afterContents = preamble.split(/\nContents\n/i);
    const body = (afterContents[1] || preamble).trim();
    if (body && body !== title) {
      return {
        title,
        chapters: [{ title: "Chapter 1", body, number: 1 }],
      };
    }
  }

  const chapters = chapterParts.map((part, i) => {
    const lines = part.trim().split("\n");
    const head = lines[0]?.trim() || "";
    const m = head.match(CHAPTER_HEAD);
    const number = m ? Number(m[1]) : i + 1;
    const chapterTitle = (m?.[2] || "").trim() || `Chapter ${number}`;
    const body = lines.slice(1).join("\n").trim();
    // Store display title as Novelist 2.0 does: "Chapter N: Name" or just the name?
    // Editor sidebar looks better with "Chapter N: Name" matching export
    const fullTitle =
      m && m[2]?.trim()
        ? `Chapter ${number}: ${m[2].trim()}`
        : `Chapter ${number}: ${chapterTitle}`;
    return { title: fullTitle, body, number };
  });

  return {
    title,
    chapters: chapters.filter((c) => c.body || c.title),
  };
}

export function novelist2ChapterHeading(sortOrder: number, title: string): string {
  const n = sortOrder + 1;
  // If already "Chapter N: ...", keep; else prefix
  if (/^Chapter\s+\d+\s*:/i.test(title.trim())) return title.trim();
  return `Chapter ${n}: ${title.trim() || `Chapter ${n}`}`;
}

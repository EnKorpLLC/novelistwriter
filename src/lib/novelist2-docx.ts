/** Novelist 2.0–style DOCX: title, optional front matter, Contents, Chapter N: Title, optional back matter */

export type ParsedMatter = {
  matter_type: string;
  title: string;
  content: string;
  enabled: boolean;
};

export type ParsedDocxProject = {
  title: string;
  chapters: { title: string; body: string; number: number }[];
  frontMatter: ParsedMatter[];
  backMatter: ParsedMatter[];
};

const CHAPTER_SPLIT = /\n(?=Chapter\s+\d+\s*:)/i;
const CHAPTER_HEAD = /^Chapter\s+(\d+)\s*:\s*(.*)$/i;

const FRONT_HEADINGS: { re: RegExp; matter_type: string; title: string }[] = [
  { re: /^copyright$/i, matter_type: "front_copyright", title: "Copyright" },
  { re: /^dedication$/i, matter_type: "front_dedication", title: "Dedication" },
  { re: /^epigraph$/i, matter_type: "front_epigraph", title: "Epigraph" },
  { re: /^(contents|table of contents|toc)$/i, matter_type: "front_toc", title: "Contents" },
  { re: /^acknowledg?ements?$/i, matter_type: "front_dedication", title: "Acknowledgments" },
];

const BACK_HEADINGS: { re: RegExp; matter_type: string; title: string }[] = [
  { re: /^about the author$/i, matter_type: "back_about_author", title: "About the Author" },
  { re: /^(also by|also by the author)$/i, matter_type: "back_also_by", title: "Also by the Author" },
  { re: /^(sample|sample chapter|excerpt)$/i, matter_type: "back_sample", title: "Sample Chapter" },
  { re: /^(newsletter|stay in touch|connect)$/i, matter_type: "back_newsletter", title: "Stay in Touch" },
];

function matchHeading(
  line: string,
  list: { re: RegExp; matter_type: string; title: string }[]
): { matter_type: string; title: string } | null {
  const t = line.trim();
  for (const h of list) {
    if (h.re.test(t)) return { matter_type: h.matter_type, title: h.title };
  }
  return null;
}

function splitByHeadings(
  text: string,
  list: { re: RegExp; matter_type: string; title: string }[]
): ParsedMatter[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ParsedMatter[] = [];
  let current: ParsedMatter | null = null;
  const body: string[] = [];

  const flush = () => {
    if (!current) return;
    current.content = body.join("\n").trim();
    // Contents TOC lists are generated on export — keep enabled even if empty
    if (current.matter_type === "front_toc" || current.content) {
      blocks.push({ ...current, enabled: true });
    }
    body.length = 0;
  };

  for (const line of lines) {
    const hit = matchHeading(line, list);
    if (hit) {
      flush();
      current = { ...hit, content: "", enabled: true };
      continue;
    }
    if (current) body.push(line);
  }
  flush();
  return blocks;
}

export function parseNovelist2DocxText(raw: string): ParsedDocxProject {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const parts = text.split(CHAPTER_SPLIT);

  let title = "Untitled Novel";
  const preamble = parts[0] || "";
  const preambleLines = preamble
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of preambleLines) {
    if (matchHeading(line, FRONT_HEADINGS)) break;
    title = line;
    break;
  }

  // Front matter = preamble minus the book title line
  let frontText = preamble;
  const titleIdx = preamble.search(new RegExp(`^${escapeReg(title)}\\s*$`, "im"));
  if (titleIdx >= 0) {
    frontText = preamble.slice(titleIdx + title.length).trim();
  }
  const frontMatter = splitByHeadings(frontText, FRONT_HEADINGS);

  // If "Contents" appears but wasn't captured as a heading block, enable TOC
  if (
    /\bcontents\b/i.test(preamble) &&
    !frontMatter.some((m) => m.matter_type === "front_toc")
  ) {
    frontMatter.push({
      matter_type: "front_toc",
      title: "Contents",
      content: "",
      enabled: true,
    });
  }

  const chapterParts = parts.slice(1);
  if (!chapterParts.length && preamble) {
    const afterContents = preamble.split(/\nContents\n/i);
    const body = (afterContents[1] || preamble).trim();
    if (body && body !== title) {
      return {
        title,
        chapters: [{ title: "Chapter 1", body, number: 1 }],
        frontMatter,
        backMatter: [],
      };
    }
  }

  const chapters = chapterParts.map((part, i) => {
    const lines = part.trim().split("\n");
    const head = lines[0]?.trim() || "";
    const m = head.match(CHAPTER_HEAD);
    const number = m ? Number(m[1]) : i + 1;
    const chapterTitle = (m?.[2] || "").trim() || `Chapter ${number}`;
    let body = lines.slice(1).join("\n").trim();

    // Last chapter may include back matter after the body — strip known back headings
    if (i === chapterParts.length - 1) {
      const backSplit = body.split(/\n(?=About the Author|Also by|Sample Chapter|Newsletter|Stay in Touch)/i);
      if (backSplit.length > 1) {
        body = backSplit[0].trim();
      }
    }

    const fullTitle =
      m && m[2]?.trim()
        ? `Chapter ${number}: ${m[2].trim()}`
        : `Chapter ${number}: ${chapterTitle}`;
    return { title: fullTitle, body, number };
  });

  // Back matter: text after last chapter heading block that matches back headings
  let backMatter: ParsedMatter[] = [];
  if (chapterParts.length) {
    const lastPart = chapterParts[chapterParts.length - 1];
    const lines = lastPart.trim().split("\n").slice(1);
    const bodyFull = lines.join("\n");
    const backIdx = bodyFull.search(
      /\n(?=About the Author|Also by(?: the Author)?|Sample Chapter|Newsletter|Stay in Touch)\s*$/im
    );
    // Also try mid-body split
    const mid = bodyFull.split(
      /\n(?=About the Author|Also by(?: the Author)?|Sample Chapter|Newsletter|Stay in Touch)/i
    );
    if (mid.length > 1) {
      const backText = mid.slice(1).join("\n");
      // Re-prefix first heading line lost by split — recover from original
      const headingMatch = bodyFull.match(
        /\n(About the Author|Also by(?: the Author)?|Sample Chapter|Newsletter|Stay in Touch)[\s\S]*$/i
      );
      backMatter = splitByHeadings(headingMatch ? headingMatch[0] : backText, BACK_HEADINGS);
      void backIdx;
    }
  }

  return {
    title,
    chapters: chapters.filter((c) => c.body || c.title),
    frontMatter,
    backMatter,
  };
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function novelist2ChapterHeading(sortOrder: number, title: string): string {
  const n = sortOrder + 1;
  if (/^Chapter\s+\d+\s*:/i.test(title.trim())) return title.trim();
  return `Chapter ${n}: ${title.trim() || `Chapter ${n}`}`;
}

export function plainToMatterHtml(text: string): string {
  if (!text.trim()) return "<p></p>";
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

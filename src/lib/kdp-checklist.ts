import type { Chapter } from "@/lib/types";

export const KDP_CHECKLIST = [
  { id: "trim", label: "Trim size set (e.g. 6×9)", field: "trim" },
  { id: "margins", label: "Margins appropriate for page count", field: "margins" },
  { id: "font", label: "Body font chosen (Garamond / Times / etc.)", field: "font" },
  { id: "copyright", label: "Copyright page in front matter", matter: "front_copyright" },
  { id: "toc", label: "Table of contents enabled", matter: "front_toc" },
  { id: "blurb", label: "Book description drafted (critique available)", meta: "blurb" },
  { id: "categories", label: "BISAC categories noted in metadata", meta: "categories" },
  { id: "keywords", label: "Seven backend keywords noted", meta: "keywords" },
  { id: "epub", label: "EPUB exported and validated", action: "epub" },
] as const;

export function validateEpubStructure(chapters: Chapter[]): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!chapters.length) issues.push("No chapters to export.");
  chapters.forEach((ch, i) => {
    if (!ch.title?.trim()) issues.push(`Chapter ${i + 1} is missing a title.`);
    if ((ch.word_count || 0) < 1 && !ch.content_text?.trim()) {
      issues.push(`Chapter "${ch.title || i + 1}" appears empty.`);
    }
  });
  return { ok: issues.length === 0, issues };
}

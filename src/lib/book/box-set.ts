import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDetails, normalizeFormat, type BookDetails, type FormatSettings } from "@/lib/book/format";
import { loadBookExtras } from "@/lib/book/load";
import type { BookExtras, ChapterInput, MatterInput } from "@/lib/book/model";

export type BoxSetRow = {
  id: string;
  user_id: string;
  title: string;
  subtitle: string;
  project_ids: string[];
  style: string;
  cover_path: string | null;
};

/** Front and back pages a box set keeps from its first book; each book's own dedication and samples are left out. */
const KEEP_MATTER = new Set(["front_copyright", "front_toc", "back_also_by", "back_about_author", "back_newsletter"]);

/**
 * Everything buildBook needs for a box set: each book becomes a divider page followed by its chapters,
 * with chapter numbers starting again for every book.
 */
export async function loadBoxSetInput(
  admin: SupabaseClient,
  set: BoxSetRow
): Promise<{
  title: string;
  subtitle: string;
  author: string;
  details: BookDetails;
  format: FormatSettings;
  chapters: (ChapterInput & { word_count?: number | null })[];
  matter: MatterInput[];
  extras: BookExtras;
  books: { id: string; title: string }[];
}> {
  const ids = set.project_ids || [];
  const [{ data: projects }, { data: chapterRows }, { data: profile }] = await Promise.all([
    admin.from("projects").select("*").eq("user_id", set.user_id).in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    ids.length
      ? admin.from("chapters").select("id, project_id, title, content_html, content_text, sort_order, word_count").in("project_id", ids).order("sort_order")
      : Promise.resolve({ data: [] as never[] }),
    admin.from("profiles").select("display_name").eq("id", set.user_id).maybeSingle(),
  ]);
  const byId = new Map((projects || []).map((p) => [p.id as string, p]));
  const ordered = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  const first = ordered[0];

  const baseFormat = normalizeFormat(first?.format_settings);
  const chapterKinds: Record<string, FormatSettings["chapterKinds"][string]> = {};
  const chapters: (ChapterInput & { word_count?: number | null })[] = [];
  let order = 0;
  for (const p of ordered) {
    const kinds = normalizeFormat(p.format_settings).chapterKinds;
    Object.assign(chapterKinds, kinds);
    const divider = `book-${p.id}`;
    chapterKinds[divider] = "part";
    chapters.push({ id: divider, title: p.title || "Untitled", content_html: "", sort_order: order++ });
    const own = (chapterRows || []).filter((c) => c.project_id === p.id);
    own.forEach((c, i) =>
      chapters.push({
        id: c.id,
        title: c.title,
        content_html: c.content_html,
        content_text: c.content_text,
        word_count: c.word_count,
        sort_order: order++,
        restartNumbering: i === 0,
      })
    );
  }

  const { data: matterRows } = first
    ? await admin.from("matter_blocks").select("*").eq("project_id", first.id).order("sort_order")
    : { data: [] };
  const firstDetails = normalizeDetails(first?.book_details);
  const extras = first ? await loadBookExtras(admin, first, { excludeIds: ids }) : {};

  return {
    title: set.title || "Box set",
    subtitle: set.subtitle || "",
    author: firstDetails.penName || profile?.display_name || "Author",
    // A box set is its own edition: no single book's ISBNs or series position
    details: { ...firstDetails, seriesNumber: "", isbnEbook: "", isbnPrint: "", edition: "" },
    format: { ...baseFormat, style: set.style || baseFormat.style, chapterKinds, lastPageCount: null },
    chapters,
    matter: (matterRows || []).filter((m) => KEEP_MATTER.has(m.matter_type)),
    // The review request would point at the first book's store page, so box sets leave it out
    extras: { ...extras, reviewLink: null },
    books: ordered.map((p) => ({ id: p.id, title: p.title || "Untitled" })),
  };
}

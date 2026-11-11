import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { htmlToBlocks } from "@/lib/book/model";
import { renderBlocks } from "@/lib/book/render";
import { audiobookFiles, signedFiles } from "@/lib/audiobook-sales";

/**
 * Read and listen (audiobook A6, step one): for a reader who bought both the ebook and the audiobook, the book's
 * text with the audiobook alongside. Chapters line up exactly; within a chapter, where you are is estimated from
 * how far through the chapter's text you are.
 */

export type ReadAlongChapter = {
  title: string;
  blocks: { html: string; chars: number }[];
  /** The matching audiobook file: its place in the full file list (shared with the player's saved position) */
  audio: { fileIndex: number; url: string; durationMs: number } | null;
};

/** The buyer behind this purchase link owns both the ebook and the audiobook of the book. */
export async function readAlongAccess(admin: SupabaseClient, token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const { data: p } = await admin.from("book_purchases").select("*").eq("download_token", token).maybeSingle();
  if (!p?.project_id || p.status !== "paid") return null;
  const email = String(p.buyer_email || "").toLowerCase();
  let q = admin.from("book_purchases").select("format, download_token, buyer_user_id").eq("project_id", p.project_id).eq("status", "paid");
  q = p.buyer_user_id ? q.or(`buyer_user_id.eq.${p.buyer_user_id},buyer_email.ilike.${email}`) : q.ilike("buyer_email", email);
  const { data: owned } = await q;
  const formats = new Set((owned || []).map((o) => (o.format as string) || "ebook"));
  if (!formats.has("ebook") || !formats.has("audiobook")) return null;
  return {
    projectId: p.project_id as string,
    buyerUserId: (p.buyer_user_id as string | null) || null,
    buyerEmail: email,
    audioToken: (owned || []).find((o) => o.format === "audiobook")?.download_token as string,
    ebookToken: (owned || []).find((o) => (o.format || "ebook") === "ebook")?.download_token as string,
  };
}

const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, " ");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function readAlongBook(admin: SupabaseClient, projectId: string): Promise<ReadAlongChapter[]> {
  const [{ data: chapters }, files] = await Promise.all([
    admin.from("chapters").select("title, content_html, content_text, sort_order").eq("project_id", projectId).order("sort_order"),
    audiobookFiles(admin, projectId),
  ]);
  const listening = (files || []).filter((f) => !f.isSample);
  const signed = await signedFiles(listening, projectId);
  // Credits aren't chapters; match the rest by order when the counts agree, otherwise by title
  const audioChapters = signed.map((f, fileIndex) => ({ ...f, fileIndex })).filter((f) => !/credits/i.test(f.title));
  const rows = chapters || [];
  return rows.map((c, i) => {
    const blocks = htmlToBlocks(c.content_html as string, c.content_text as string).map((b) => {
      const html = renderBlocks([b], { opening: "none", ornament: "* * *" });
      return { html, chars: Math.max(1, plain(html).trim().length) };
    });
    const byOrder = audioChapters.length === rows.length ? audioChapters[i] : null;
    const byTitle = audioChapters.find((f) => norm(f.title) === norm((c.title as string) || "") || norm(f.title).endsWith(norm((c.title as string) || "-")));
    const a = byOrder || byTitle || null;
    return { title: (c.title as string)?.trim() || `Chapter ${i + 1}`, blocks, audio: a ? { fileIndex: a.fileIndex, url: a.url, durationMs: a.durationMs } : null };
  });
}

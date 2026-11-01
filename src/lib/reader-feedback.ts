import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { normalizeReviewLinks, reviewSiteKey } from "@/lib/arc";
import { reactionGlyph } from "@/lib/beta-platform";

export type FeedbackReply = { id: string; body: string; createdAt: string; fromAuthor: boolean; name: string };

export type FeedbackComment = {
  id: string;
  chapterId: string | null;
  excerpt: string | null;
  body: string;
  readerName: string;
  createdAt: string;
  completed: boolean;
  fromAuthor: boolean;
  reactions: { emoji: string; count: number }[];
  replies: FeedbackReply[];
};

export type ReaderFeedback = {
  title: string;
  chapters: { id: string; title: string; sortOrder: number }[];
  /** Top-level comments, in book order then oldest first */
  comments: FeedbackComment[];
  finalReviews: { name: string; body: string; createdAt: string }[];
  dnf: { name: string; chapter: string | null; reason: string; at: string | null }[];
  arcReviews: { name: string; body: string; finishedAt: string | null; onTime: boolean | null; postedOn: string[] }[];
};

function nameOf(row: { display_name: string | null; email: string } | undefined) {
  if (!row) return "Reader";
  return row.display_name?.trim() || row.email.split("@")[0] || "Reader";
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Everything beta and ARC readers said about one book, for the author. Reader text only, no manuscript. */
export async function loadReaderFeedback(
  admin: SupabaseClient,
  projectId: string,
  opts: { chapterId?: string } = {}
): Promise<ReaderFeedback> {
  const FIELDS = "id, body, excerpt, chapter_id, invite_id, parent_id, author_user_id, completed, created_at";
  let commentQuery = admin
    .from("beta_comments")
    .select(FIELDS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (opts.chapterId) commentQuery = commentQuery.eq("chapter_id", opts.chapterId).is("parent_id", null);

  const [{ data: project }, { data: chapters }, { data: comments }] = await Promise.all([
    admin.from("projects").select("title, user_id, arc_deadline, arc_review_links").eq("id", projectId).maybeSingle(),
    admin.from("chapters").select("id, title, sort_order").eq("project_id", projectId).order("sort_order"),
    commentQuery,
  ]);
  const rows = [...(comments || [])];
  // Replies are saved without a chapter, so a chapter view loads them by parent
  if (opts.chapterId && rows.length) {
    for (const ids of chunk(rows.map((c) => c.id), 200)) {
      const { data } = await admin.from("beta_comments").select(FIELDS).in("parent_id", ids).order("created_at");
      rows.push(...(data || []));
    }
  }

  const { data: authorProfile } = project
    ? await admin.from("profiles").select("display_name").eq("id", project.user_id).maybeSingle()
    : { data: null };
  const authorName = authorProfile?.display_name?.trim() || "Author";

  const reactions: { comment_id: string; emoji: string }[] = [];
  for (const ids of chunk(rows.filter((c) => !c.parent_id).map((c) => c.id), 200)) {
    const { data } = await admin.from("beta_comment_reactions").select("comment_id, emoji").in("comment_id", ids);
    reactions.push(...(data || []));
  }
  const reactionsBy = new Map<string, Map<string, number>>();
  for (const r of reactions) {
    const m = reactionsBy.get(r.comment_id) || new Map<string, number>();
    m.set(r.emoji, (m.get(r.emoji) || 0) + 1);
    reactionsBy.set(r.comment_id, m);
  }

  const [{ data: betaInvites }, { data: reviews }, { data: arcInvites }] = await Promise.all([
    admin
      .from("beta_invites")
      .select("id, display_name, email, status, dnf_reason, dnf_at, current_chapter_id, finished_at")
      .eq("project_id", projectId),
    opts.chapterId
      ? Promise.resolve({ data: [] as { invite_id: string; body: string; created_at: string }[] })
      : admin
          .from("beta_book_reviews")
          .select("invite_id, body, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true }),
    opts.chapterId
      ? Promise.resolve({
          data: [] as {
            display_name: string | null;
            email: string;
            review_body: string | null;
            finished_at: string | null;
            review_posts: unknown;
          }[],
        })
      : admin
          .from("arc_invites")
          .select("display_name, email, review_body, finished_at, review_posts")
          .eq("project_id", projectId)
          .eq("status", "active"),
  ]);
  const inviteById = new Map((betaInvites || []).map((i) => [i.id, i]));
  const chapterList = (chapters || []).map((c) => ({ id: c.id, title: c.title || "Untitled", sortOrder: c.sort_order }));
  const chapterById = new Map(chapterList.map((c) => [c.id, c]));

  const repliesBy = new Map<string, FeedbackReply[]>();
  for (const c of rows.filter((r) => r.parent_id)) {
    const list = repliesBy.get(c.parent_id) || [];
    list.push({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      fromAuthor: Boolean(c.author_user_id),
      name: c.author_user_id ? authorName : nameOf(inviteById.get(c.invite_id)),
    });
    repliesBy.set(c.parent_id, list);
  }

  const order = (id: string | null) => (id ? chapterById.get(id)?.sortOrder ?? 1e9 : 2e9);
  const topLevel: FeedbackComment[] = rows
    .filter((c) => !c.parent_id)
    .map((c) => ({
      id: c.id,
      chapterId: c.chapter_id,
      excerpt: c.excerpt?.trim() || null,
      body: c.body,
      readerName: c.author_user_id ? authorName : nameOf(inviteById.get(c.invite_id)),
      createdAt: c.created_at,
      completed: Boolean(c.completed),
      fromAuthor: Boolean(c.author_user_id),
      reactions: [...(reactionsBy.get(c.id) || new Map<string, number>())].map(([emoji, count]) => ({ emoji, count })),
      replies: repliesBy.get(c.id) || [],
    }))
    .sort((a, b) => order(a.chapterId) - order(b.chapterId) || a.createdAt.localeCompare(b.createdAt));

  const deadlineMs = project?.arc_deadline ? Date.parse(project.arc_deadline) : NaN;
  const siteLabel = new Map(
    normalizeReviewLinks(project?.arc_review_links).map((l) => [reviewSiteKey(l), l.label] as const)
  );

  return {
    title: project?.title || "Untitled",
    chapters: chapterList,
    comments: topLevel,
    finalReviews: (reviews || [])
      .filter((r) => String(r.body || "").trim())
      .map((r) => ({ name: nameOf(inviteById.get(r.invite_id)), body: r.body, createdAt: r.created_at })),
    dnf: opts.chapterId
      ? []
      : (betaInvites || [])
          .filter((i) => i.status === "dnf" && !i.finished_at)
          .map((i) => ({
            name: nameOf(i),
            chapter: i.current_chapter_id ? chapterById.get(i.current_chapter_id)?.title || null : null,
            reason: String(i.dnf_reason || "").trim(),
            at: i.dnf_at,
          })),
    arcReviews: (arcInvites || [])
      .filter((i) => String(i.review_body || "").trim())
      .map((i) => ({
        name: nameOf(i),
        body: String(i.review_body),
        finishedAt: i.finished_at,
        onTime: i.finished_at && Number.isFinite(deadlineMs) ? Date.parse(i.finished_at) <= deadlineMs : null,
        postedOn: Object.keys((i.review_posts as Record<string, string>) || {}).map((k) => siteLabel.get(k) || k),
      })),
  };
}

export type FeedbackExportOptions = {
  includeBeta: boolean;
  includeArc: boolean;
  /** Final reviews and ARC reviews only: no comments or DNF reasons */
  reviewsOnly: boolean;
  openOnly: boolean;
  /** null = every chapter */
  chapterIds: Set<string> | null;
  includeGeneral: boolean;
};

function day(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Paragraph text with the reader's line breaks kept. */
function runs(text: string, opts: { italics?: boolean; size?: number; color?: string; bold?: boolean } = {}) {
  return String(text)
    .split(/\r?\n/)
    .map((line, i) => new TextRun({ text: line, break: i ? 1 : 0, ...opts }));
}

const MUTED = "6B6B6B";

function commentBlock(c: FeedbackComment): Paragraph[] {
  const out: Paragraph[] = [];
  if (c.excerpt) {
    out.push(new Paragraph({ indent: { left: 360 }, spacing: { before: 200 }, children: runs(`“${c.excerpt}”`, { italics: true }) }));
  }
  out.push(new Paragraph({ spacing: { before: c.excerpt ? 80 : 200 }, children: runs(c.body) }));
  const reactions = c.reactions.map((r) => `${reactionGlyph(r.emoji)} ${r.count}`).join("  ");
  out.push(
    new Paragraph({
      children: [
        new TextRun({
          text: [`— ${c.readerName}`, day(c.createdAt), c.completed ? "Resolved" : "Open", reactions]
            .filter(Boolean)
            .join(" · "),
          size: 18,
          color: MUTED,
        }),
      ],
    })
  );
  for (const r of c.replies) {
    out.push(
      new Paragraph({
        indent: { left: 720 },
        spacing: { before: 60 },
        children: [
          new TextRun({ text: `${r.name}${r.fromAuthor ? " (you)" : ""}: `, bold: true, size: 20 }),
          ...runs(r.body, { size: 20 }),
          new TextRun({ text: `  ${day(r.createdAt)}`, size: 16, color: MUTED }),
        ],
      })
    );
  }
  return out;
}

const note = (text: string) => new Paragraph({ children: [new TextRun({ text, italics: true, color: MUTED })] });

export async function feedbackDocx(fb: ReaderFeedback, o: FeedbackExportOptions): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(`Reader feedback: ${fb.title}`)] }),
  ];
  const filters = [
    `Exported ${day(new Date().toISOString())}`,
    o.reviewsOnly ? "Reviews only" : null,
    !o.reviewsOnly && o.openOnly ? "Unresolved comments only" : null,
    !o.reviewsOnly && o.chapterIds ? `${o.chapterIds.size} selected chapter${o.chapterIds.size === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  children.push(note(filters.join(" · ")));

  if (o.includeBeta && !o.reviewsOnly) {
    const visible = fb.comments.filter((c) => !c.fromAuthor && (!o.openOnly || !c.completed));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Chapter comments")] }));
    let any = false;
    fb.chapters.forEach((ch, idx) => {
      if (o.chapterIds && !o.chapterIds.has(ch.id)) return;
      const list = visible.filter((c) => c.chapterId === ch.id);
      if (!list.length) return;
      any = true;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun(`Chapter ${idx + 1}: ${ch.title} (${list.length})`)],
        })
      );
      for (const c of list) children.push(...commentBlock(c));
    });
    if (!any) children.push(note("No chapter comments match these filters."));

    const general = visible.filter((c) => !c.chapterId);
    if (o.includeGeneral && general.length) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("General comments")] }));
      for (const c of general) children.push(...commentBlock(c));
    }

    if (!o.chapterIds && fb.dnf.length) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Did not finish")] }));
      for (const d of fb.dnf) {
        children.push(
          new Paragraph({
            spacing: { before: 200 },
            children: [
              new TextRun({ text: d.name, bold: true }),
              new TextRun({
                text: [d.chapter ? ` · stopped at ${d.chapter}` : "", d.at ? ` · ${day(d.at)}` : ""].join(""),
                color: MUTED,
              }),
            ],
          }),
          new Paragraph({ children: runs(d.reason || "No reason given.") })
        );
      }
    }
  }

  if (o.includeBeta) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Beta final reviews")] }));
    if (!fb.finalReviews.length) children.push(note("No final reviews yet."));
    for (const r of fb.finalReviews) {
      children.push(
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({ text: r.name, bold: true }), new TextRun({ text: ` · ${day(r.createdAt)}`, color: MUTED })],
        }),
        new Paragraph({ children: runs(r.body) })
      );
    }
  }

  if (o.includeArc) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("ARC reviews")] }));
    if (!fb.arcReviews.length) children.push(note("No ARC reviews yet."));
    for (const r of fb.arcReviews) {
      const meta = [
        r.finishedAt ? `finished ${day(r.finishedAt)}` : "",
        r.onTime === true ? "on time" : r.onTime === false ? "after the deadline" : "",
        r.postedOn.length ? `posted on ${r.postedOn.join(", ")}` : "",
      ].filter(Boolean);
      children.push(
        new Paragraph({
          spacing: { before: 200 },
          children: [
            new TextRun({ text: r.name, bold: true }),
            new TextRun({ text: meta.length ? ` · ${meta.join(" · ")}` : "", color: MUTED }),
          ],
        }),
        new Paragraph({ children: runs(r.body) })
      );
    }
  }

  const doc = new Document({ creator: "Novelist Writer", title: `Reader feedback: ${fb.title}`, sections: [{ children }] });
  return Packer.toBuffer(doc);
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { linkInvitesForEmail, type ReactionEmoji, REACTION_EMOJIS } from "@/lib/beta-platform";
import { findReaderInvite, inviteAllowsReading, enforceBetaAccessGates } from "@/lib/beta-server";

const REACTION_IDS = new Set(REACTION_EMOJIS.map((r) => r.id));

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const scope = url.searchParams.get("scope") || "mine"; // mine | project

  const admin = createServiceClient();
  await linkInvitesForEmail(admin, user.id, user.email);

  if (scope === "project" && projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: comments } = await admin
      .from("beta_comments")
      .select(
        "id, body, excerpt, chapter_id, invite_id, parent_id, author_user_id, reader_user_id, completed, created_at"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(3000);

    const commentIds = (comments || []).map((c) => c.id);
    const { data: reactions } = commentIds.length
      ? await admin
          .from("beta_comment_reactions")
          .select("id, comment_id, user_id, emoji")
          .in("comment_id", commentIds)
      : { data: [] as { id: string; comment_id: string; user_id: string; emoji: string }[] };

    return NextResponse.json({
      comments: comments || [],
      reactions: reactions || [],
    });
  }

  // Reader hub: my comments across books
  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  const [{ data: byUser }, { data: byEmail }] = await Promise.all([
    admin.from("beta_invites").select("id, project_id").eq("reader_user_id", user.id),
    email.includes("@")
      ? admin.from("beta_invites").select("id, project_id").ilike("email", email)
      : Promise.resolve({ data: [] as { id: string; project_id: string }[] }),
  ]);
  const inviteIds = [...new Set([...(byUser || []), ...(byEmail || [])].map((i) => i.id))];
  if (!inviteIds.length) {
    return NextResponse.json({ threads: [] });
  }

  const { data: myComments } = await admin
    .from("beta_comments")
    .select(
      "id, body, excerpt, chapter_id, invite_id, parent_id, author_user_id, reader_user_id, completed, created_at, project_id"
    )
    .in("invite_id", inviteIds)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(500);

  const topIds = (myComments || []).map((c) => c.id);
  const projectIds = [...new Set((myComments || []).map((c) => c.project_id))];

  const [{ data: replies }, { data: reactions }, { data: projects }, { data: chapters }] =
    await Promise.all([
      topIds.length
        ? admin
            .from("beta_comments")
            .select(
              "id, body, excerpt, chapter_id, invite_id, parent_id, author_user_id, reader_user_id, completed, created_at, project_id"
            )
            .in("parent_id", topIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as never[] }),
      topIds.length
        ? admin.from("beta_comment_reactions").select("comment_id, emoji, user_id").in("comment_id", topIds)
        : Promise.resolve({ data: [] as never[] }),
      projectIds.length
        ? admin.from("projects").select("id, title").in("id", projectIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      projectIds.length
        ? admin.from("chapters").select("id, title, project_id").in("project_id", projectIds)
        : Promise.resolve({ data: [] as { id: string; title: string; project_id: string }[] }),
    ]);

  const titleByProject = new Map((projects || []).map((p) => [p.id, p.title]));
  const chapterTitle = new Map((chapters || []).map((c) => [c.id, c.title]));
  const repliesByParent = new Map<string, typeof replies>();
  for (const r of replies || []) {
    const list = repliesByParent.get(r.parent_id!) || [];
    list.push(r);
    repliesByParent.set(r.parent_id!, list);
  }
  const reactionsByComment = new Map<string, { emoji: string; count: number }[]>();
  for (const r of reactions || []) {
    const list = reactionsByComment.get(r.comment_id) || [];
    const existing = list.find((x) => x.emoji === r.emoji);
    if (existing) existing.count += 1;
    else list.push({ emoji: r.emoji, count: 1 });
    reactionsByComment.set(r.comment_id, list);
  }

  const inviteProject = new Map(
    [...(byUser || []), ...(byEmail || [])].map((i) => [i.id, i.project_id])
  );

  const threads = (myComments || []).map((c) => ({
    id: c.id,
    body: c.body,
    excerpt: c.excerpt,
    completed: Boolean(c.completed),
    createdAt: c.created_at,
    projectId: c.project_id,
    projectTitle: titleByProject.get(c.project_id) || "Manuscript",
    chapterId: c.chapter_id,
    chapterTitle: c.chapter_id ? chapterTitle.get(c.chapter_id) || "Chapter" : null,
    hasAccess: inviteAllowsReading(
      // approximate: if invite still in list we treat as possible; client uses book gate
      { status: "accepted" }
    ),
    openUrl: `/beta/read/${c.project_id}${c.chapter_id ? `?chapter=${c.chapter_id}` : ""}`,
    reactions: reactionsByComment.get(c.id) || [],
    replies: (repliesByParent.get(c.id) || []).map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      fromAuthor: Boolean(r.author_user_id),
      fromReader: Boolean(r.invite_id || r.reader_user_id),
    })),
    inviteProjectId: c.invite_id ? inviteProject.get(c.invite_id) : c.project_id,
  }));

  return NextResponse.json({ threads });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    action?: "reply" | "react" | "unreact" | "comment";
    projectId?: string;
    parentId?: string;
    commentId?: string;
    emoji?: string;
    text?: string;
    chapterId?: string | null;
    excerpt?: string | null;
  };

  const admin = createServiceClient();
  await linkInvitesForEmail(admin, user.id, user.email);

  if (body.action === "react" || body.action === "unreact") {
    const commentId = String(body.commentId || "");
    if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

    const { data: comment } = await admin
      .from("beta_comments")
      .select("id, project_id")
      .eq("id", commentId)
      .maybeSingle();
    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", comment.project_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: "Only the author can react" }, { status: 403 });
    }

    if (body.action === "unreact") {
      await admin
        .from("beta_comment_reactions")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", user.id);
      return NextResponse.json({ ok: true });
    }

    const emoji = String(body.emoji || "") as ReactionEmoji;
    if (!REACTION_IDS.has(emoji)) {
      return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
    }

    const { error } = await admin.from("beta_comment_reactions").upsert(
      {
        comment_id: commentId,
        user_id: user.id,
        emoji,
      },
      { onConflict: "comment_id,user_id" }
    );
    if (error) {
      if (error.message.includes("beta_comment_reactions")) {
        return NextResponse.json(
          {
            error:
              "Database needs an update. Run supabase/migration_beta_platform.sql in the Supabase SQL editor.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, emoji });
  }

  if (body.action === "reply") {
    const parentId = String(body.parentId || "");
    const text = String(body.text || "").trim().slice(0, 8000);
    const projectId = String(body.projectId || "");
    if (!parentId || !text || !projectId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data: parent } = await admin
      .from("beta_comments")
      .select("id, project_id, invite_id")
      .eq("id", parentId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: owned } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (owned) {
      const { data, error } = await admin
        .from("beta_comments")
        .insert({
          project_id: projectId,
          parent_id: parentId,
          author_user_id: user.id,
          invite_id: null,
          body: text,
          chapter_id: null,
          excerpt: null,
        })
        .select("id, body, created_at, author_user_id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, reply: data });
    }

    const invite = await findReaderInvite(admin, {
      projectId,
      userId: user.id,
      email: user.email,
    });
    if (!inviteAllowsReading(invite)) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const { data: readerProject } = await admin
      .from("projects")
      .select("id, beta_expires_at, beta_ready")
      .eq("id", projectId)
      .maybeSingle();
    if (!readerProject) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const gate = await enforceBetaAccessGates(admin, readerProject);
    if (gate.blocked) {
      return NextResponse.json({ error: gate.reason, code: "removed" }, { status: 403 });
    }

    const { data, error } = await admin
      .from("beta_comments")
      .insert({
        project_id: projectId,
        parent_id: parentId,
        invite_id: invite!.id,
        reader_user_id: user.id,
        body: text,
        chapter_id: null,
        excerpt: null,
      })
      .select("id, body, created_at, invite_id, reader_user_id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reply: data });
  }

  if (body.action === "comment") {
    // Session-authenticated top-level comment
    const projectId = String(body.projectId || "");
    const text = String(body.text || "").trim().slice(0, 8000);
    if (!projectId || !text) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const invite = await findReaderInvite(admin, {
      projectId,
      userId: user.id,
      email: user.email,
    });
    if (!invite || (invite.status !== "pending" && invite.status !== "accepted")) {
      return NextResponse.json({ error: "Invalid invite" }, { status: 403 });
    }

    const { data: commentProject } = await admin
      .from("projects")
      .select("id, beta_expires_at, beta_ready")
      .eq("id", projectId)
      .maybeSingle();
    if (!commentProject) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const gate = await enforceBetaAccessGates(admin, commentProject);
    if (gate.blocked) {
      return NextResponse.json({ error: gate.reason, code: "removed" }, { status: 403 });
    }

    if (invite.status === "pending") {
      await admin.from("beta_invites").update({ status: "accepted" }).eq("id", invite.id);
    }
    const excerptText =
      typeof body.excerpt === "string" ? body.excerpt.replace(/\s+/g, " ").trim().slice(0, 2000) : "";
    const { error } = await admin.from("beta_comments").insert({
      project_id: projectId,
      chapter_id: body.chapterId || null,
      invite_id: invite.id,
      reader_user_id: user.id,
      body: text,
      excerpt: excerptText || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/stripe";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: invites }, { data: comments }] = await Promise.all([
    supabase
      .from("beta_invites")
      .select("id, email, token, status, created_at")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("beta_comments")
      .select("id, body, excerpt, chapter_id, invite_id, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const chapterIds = [
    ...new Set((comments || []).map((c) => c.chapter_id).filter(Boolean)),
  ] as string[];
  const inviteIds = [
    ...new Set((comments || []).map((c) => c.invite_id).filter(Boolean)),
  ] as string[];

  const [{ data: chapters }, { data: commentInvites }] = await Promise.all([
    chapterIds.length
      ? supabase.from("chapters").select("id, title").in("id", chapterIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    inviteIds.length
      ? supabase.from("beta_invites").select("id, email").in("id", inviteIds)
      : Promise.resolve({ data: [] as { id: string; email: string }[] }),
  ]);

  const chapterTitle = new Map((chapters || []).map((c) => [c.id, c.title]));
  const inviteEmail = new Map((commentInvites || []).map((i) => [i.id, i.email]));

  return NextResponse.json({
    invites: (invites || []).map((i) => ({
      ...i,
      link: appUrl(`/beta/${i.token}`),
    })),
    comments: (comments || []).map((c) => ({
      id: c.id,
      body: c.body,
      excerpt: c.excerpt,
      chapterId: c.chapter_id,
      chapterTitle: c.chapter_id ? chapterTitle.get(c.chapter_id) || "Chapter" : null,
      readerEmail: c.invite_id ? inviteEmail.get(c.invite_id) || null : null,
      createdAt: c.created_at,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const { data, error } = await supabase
    .from("beta_invites")
    .insert({
      project_id: projectId,
      user_id: user.id,
      email,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    invite: data,
    link: appUrl(`/beta/${data.token}`),
  });
}

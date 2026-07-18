import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCreateProject } from "@/lib/credits";
import { DEFAULT_MATTER } from "@/lib/matter";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = (body.title as string) || "Untitled Novel";

  const gate = await canCreateProject(user.id);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Unlock another project or subscribe.", code: "needs_unlock" },
      { status: 402 }
    );
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title,
      is_unlocked: true,
    })
    .select("*")
    .single();

  if (error || !project) {
    return NextResponse.json({ error: error?.message || "Create failed" }, { status: 500 });
  }

  await supabase.from("chapters").insert({
    project_id: project.id,
    user_id: user.id,
    title: "Chapter 1",
    sort_order: 0,
  });

  const matterRows = DEFAULT_MATTER.map((m) => ({
    ...m,
    project_id: project.id,
    user_id: user.id,
  }));
  await supabase.from("matter_blocks").insert(matterRows);

  return NextResponse.json({ id: project.id });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return NextResponse.json({ projects: data ?? [] });
}

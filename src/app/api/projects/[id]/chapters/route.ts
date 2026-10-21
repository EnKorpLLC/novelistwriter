import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { projectLockedMessage } from "@/lib/studio-access";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lockMsg = await projectLockedMessage(supabase, projectId);
  if (lockMsg) return NextResponse.json({ error: lockMsg, code: "project_locked" }, { status: 423 });

  const { count } = await supabase
    .from("chapters")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { data, error } = await supabase
    .from("chapters")
    .insert({
      project_id: projectId,
      user_id: user.id,
      title: `Chapter ${(count ?? 0) + 1}`,
      sort_order: count ?? 0,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chapter: data });
}

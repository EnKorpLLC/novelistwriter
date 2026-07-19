import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** List recent AI critique jobs for a project (persisted reports). */
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

  const { data, error } = await supabase
    .from("ai_jobs")
    .select("id, job_type, status, credit_cost, input, result, error, created_at, completed_at, chapter_id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hide per-batch multipass units — only show final/user-facing reports
  const jobs = (data || []).filter((j) => {
    const input = (j.input || {}) as { unit?: boolean; ephemeral?: boolean };
    return !input.unit && !input.ephemeral;
  });

  return NextResponse.json({ jobs });
}

/** Batch delete reports: { action: "delete", ids?: string[], deleteAll?: boolean } */
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

  const body = await req.json().catch(() => ({}));
  if (body?.action !== "delete") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (body.deleteAll) {
    const { error, count } = await supabase
      .from("ai_jobs")
      .delete({ count: "exact" })
      .eq("project_id", projectId)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id: unknown) => typeof id === "string")
    : [];
  if (!ids.length) {
    return NextResponse.json({ error: "Provide ids[] or deleteAll: true" }, { status: 400 });
  }

  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error, count } = await supabase
      .from("ai_jobs")
      .delete({ count: "exact" })
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .in("id", chunk);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    deleted += count ?? chunk.length;
  }
  return NextResponse.json({ ok: true, deleted });
}

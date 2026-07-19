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
    .limit(40);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hide per-batch multipass units — only show final/user-facing reports
  const jobs = (data || []).filter((j) => {
    const input = (j.input || {}) as { unit?: boolean; ephemeral?: boolean };
    return !input.unit && !input.ephemeral;
  });

  return NextResponse.json({ jobs });
}

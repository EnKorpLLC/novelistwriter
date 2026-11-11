import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { decodeTraces, traceCode } from "@/lib/copy-guard";

/** { text }: which of this book's beta or ARC readers a pasted passage came from, by the hidden code in it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const codes = decodeTraces(String(body.text || "").slice(0, 200_000));
  if (!codes.length) return NextResponse.json({ found: false, readers: [] });

  const admin = createServiceClient();
  const [{ data: arc }, { data: beta }] = await Promise.all([
    admin.from("arc_invites").select("id, email, display_name").eq("project_id", projectId),
    admin.from("beta_invites").select("id, email, display_name").eq("project_id", projectId),
  ]);
  const readers = [
    ...(arc || []).map((r) => ({ ...r, kind: "Advance reader" })),
    ...(beta || []).map((r) => ({ ...r, kind: "Beta reader" })),
  ]
    .filter((r) => codes.includes(traceCode(r.id)))
    .map((r) => ({ kind: r.kind, name: r.display_name || "", email: r.email }));
  return NextResponse.json({ found: true, readers });
}

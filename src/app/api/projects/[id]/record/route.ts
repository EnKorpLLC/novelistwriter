import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { computeWritingRecord } from "@/lib/writing-record";

async function owner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("projects")
    .select("id, record_public")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  return data ? { supabase, user, project: data } : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const record = await computeWritingRecord(createServiceClient(), id);
  return NextResponse.json({ record, recordPublic: Boolean(auth.project.record_public) });
}

/** Author chooses whether the book's writing record is public. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { public?: boolean };
  if (typeof body.public !== "boolean") return NextResponse.json({ error: "public required" }, { status: 400 });
  const { error } = await auth.supabase
    .from("projects")
    .update({ record_public: body.public })
    .eq("id", id)
    .eq("user_id", auth.user.id);
  if (error) {
    const hint = error.message.includes("record_public")
      ? "Database needs an update. Run supabase/migration_writing_record.sql in the Supabase SQL editor."
      : error.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recordPublic: body.public });
}

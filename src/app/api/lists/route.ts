import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { LIBRARY_MIGRATION_HINT } from "@/lib/reader-library";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Your lists, with the books on each. */
export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const { data: lists, error } = await admin.from("reader_lists").select("id, title, description, public, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: LIBRARY_MIGRATION_HINT }, { status: 500 });
  const ids = (lists || []).map((l) => l.id);
  const { data: items } = ids.length ? await admin.from("reader_list_items").select("list_id, project_id, note, position").in("list_id", ids).order("position") : { data: [] };
  const pids = [...new Set((items || []).map((i) => i.project_id))];
  const { data: projects } = pids.length ? await admin.from("projects").select("id, title").in("id", pids) : { data: [] };
  const title = new Map((projects || []).map((p) => [p.id, p.title || "Untitled"]));
  return NextResponse.json({
    lists: (lists || []).map((l) => ({
      ...l,
      items: (items || []).filter((i) => i.list_id === l.id).map((i) => ({ projectId: i.project_id, title: title.get(i.project_id) || "Untitled", note: i.note })),
    })),
  });
}

/** Create a list: { title, description?, public? } */
export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { title?: string; description?: string; public?: boolean };
  const title = String(body.title || "").trim().slice(0, 100);
  if (!title) return NextResponse.json({ error: "Give the list a name." }, { status: 400 });
  const admin = createServiceClient();
  const { count } = await admin.from("reader_lists").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count || 0) >= 50) return NextResponse.json({ error: "You can have up to 50 lists." }, { status: 400 });
  const { data, error } = await admin
    .from("reader_lists")
    .insert({ user_id: user.id, title, description: String(body.description || "").trim().slice(0, 1000), public: body.public !== false })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: LIBRARY_MIGRATION_HINT }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

/** Edit a list or its books: { id, title?, description?, public?, addProjectIds?, removeProjectId?, note?: { projectId, text } } */
export async function PATCH(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    title?: string;
    description?: string;
    public?: boolean;
    addProjectIds?: string[];
    removeProjectId?: string;
    note?: { projectId?: string; text?: string };
  };
  const admin = createServiceClient();
  const { data: list } = await admin.from("reader_lists").select("id").eq("id", String(body.id || "")).eq("user_id", user.id).maybeSingle();
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 100);
  if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 1000);
  if (typeof body.public === "boolean") patch.public = body.public;
  await admin.from("reader_lists").update(patch).eq("id", list.id);

  const add = (body.addProjectIds || []).filter((id) => !id.startsWith("auto:")).slice(0, 200);
  if (add.length) {
    const { data: published } = await admin.from("projects").select("id").in("id", add).eq("published", true);
    const { count } = await admin.from("reader_list_items").select("project_id", { count: "exact", head: true }).eq("list_id", list.id);
    const start = count || 0;
    if (published?.length) {
      await admin
        .from("reader_list_items")
        .upsert(published.map((p, i) => ({ list_id: list.id, project_id: p.id, position: start + i })), { onConflict: "list_id,project_id", ignoreDuplicates: true });
    }
  }
  if (body.removeProjectId) await admin.from("reader_list_items").delete().eq("list_id", list.id).eq("project_id", body.removeProjectId);
  if (body.note?.projectId) {
    await admin.from("reader_list_items").update({ note: String(body.note.text || "").trim().slice(0, 500) }).eq("list_id", list.id).eq("project_id", body.note.projectId);
  }
  return NextResponse.json({ ok: true });
}

/** Delete a list: { id } */
export async function DELETE(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  await createServiceClient().from("reader_lists").delete().eq("id", String(body.id || "")).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

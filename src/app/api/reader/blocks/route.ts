import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SAFETY_MIGRATION_HINT } from "@/lib/reader-safety";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Authors this reader has blocked. */
export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const { data, error } = await admin.from("reader_blocks").select("author_user_id, created_at").eq("reader_user_id", user.id);
  if (error) return NextResponse.json({ blocks: [], error: SAFETY_MIGRATION_HINT });
  const ids = (data || []).map((b) => b.author_user_id as string);
  const { data: names } = ids.length ? await admin.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const nameOf = new Map((names || []).map((n) => [n.id as string, (n.display_name as string) || "Author"]));
  return NextResponse.json({ blocks: (data || []).map((b) => ({ authorUserId: b.author_user_id, name: nameOf.get(b.author_user_id) || "Author", since: b.created_at })) });
}

/** Block an author: their books leave this reader's catalog, and they can't invite or message the reader. */
export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { authorUserId?: string };
  const authorId = String(body.authorUserId || "");
  if (!authorId || authorId === user.id) return NextResponse.json({ error: "Pick an author." }, { status: 400 });
  const { error } = await createServiceClient().from("reader_blocks").upsert({ reader_user_id: user.id, author_user_id: authorId });
  if (error) return NextResponse.json({ error: /reader_blocks/.test(error.message) ? SAFETY_MIGRATION_HINT : error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const authorId = new URL(req.url).searchParams.get("authorUserId") || "";
  await createServiceClient().from("reader_blocks").delete().eq("reader_user_id", user.id).eq("author_user_id", authorId);
  return NextResponse.json({ ok: true });
}

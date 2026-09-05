import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("beta_author_follows")
    .select("id, author_user_id, created_at")
    .eq("reader_user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  }

  const authorIds = (data || []).map((f) => f.author_user_id);
  const { data: authors } = authorIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", authorIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameById = new Map((authors || []).map((a) => [a.id, a.display_name || "Author"]));

  return NextResponse.json({
    follows: (data || []).map((f) => ({
      id: f.id,
      authorUserId: f.author_user_id,
      authorName: nameById.get(f.author_user_id) || "Author",
      createdAt: f.created_at,
    })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { authorUserId?: string; action?: "follow" | "unfollow" };
  const authorUserId = String(body.authorUserId || "");
  if (!authorUserId) return NextResponse.json({ error: "authorUserId required" }, { status: 400 });
  if (authorUserId === user.id) {
    return NextResponse.json({ error: "You can’t follow yourself." }, { status: 400 });
  }

  const admin = createServiceClient();

  // Ensure beta reader role
  await supabase
    .from("profiles")
    .update({ is_beta_reader: true, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (body.action === "unfollow") {
    await admin
      .from("beta_author_follows")
      .delete()
      .eq("reader_user_id", user.id)
      .eq("author_user_id", authorUserId);
    return NextResponse.json({ ok: true, following: false });
  }

  const { error } = await admin.from("beta_author_follows").upsert(
    {
      reader_user_id: user.id,
      author_user_id: authorUserId,
    },
    { onConflict: "reader_user_id,author_user_id" }
  );
  if (error) {
    return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, following: true });
}

function migrationHint(message: string) {
  if (message.includes("beta_author_follows")) {
    return "Database needs an update. Run supabase/migration_beta_social.sql in the Supabase SQL editor.";
  }
  return message;
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userHasStudio } from "@/lib/credits";

const MIGRATION_HINT = "Database needs an update. Run supabase/migration_formatting.sql in the Supabase SQL editor.";

/** The author's box sets and the books they can put in them. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [studio, { data: sets, error }, { data: projects }] = await Promise.all([
    userHasStudio(user.id),
    supabase.from("box_sets").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("projects").select("id, title, word_count, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
  ]);
  return NextResponse.json({
    studio,
    sets: sets || [],
    projects: projects || [],
    migrationNeeded: Boolean(error && /box_sets/.test(error.message)),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasStudio(user.id))) {
    return NextResponse.json({ error: "Box sets are part of Studio. Upgrade on the Billing page.", code: "studio_required" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const { data, error } = await supabase
    .from("box_sets")
    .insert({ user_id: user.id, title: String(body.title || "").trim().slice(0, 200) || "My box set" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: /box_sets/.test(error.message) ? MIGRATION_HINT : error.message }, { status: 500 });
  return NextResponse.json({ set: data });
}

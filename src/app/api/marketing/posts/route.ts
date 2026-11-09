import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userHasPro } from "@/lib/credits";
import { isValidDayString } from "@/lib/local-day";

const NETWORKS = ["any", "instagram", "tiktok", "facebook", "x", "threads", "bluesky", "linkedin", "newsletter"];
const CARDS = ["none", "quote", "review", "progress", "cover"];
const MIGRATION_HINT = "Database needs an update. Run supabase/migration_author_marketing.sql in the Supabase SQL editor.";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

function fields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof body.post_on === "string" && isValidDayString(body.post_on)) out.post_on = body.post_on;
  if (typeof body.network === "string" && NETWORKS.includes(body.network)) out.network = body.network;
  if (typeof body.body === "string") out.body = body.body.slice(0, 3000);
  if (typeof body.card === "string" && CARDS.includes(body.card)) out.card = body.card;
  if ("project_id" in body) out.project_id = typeof body.project_id === "string" && body.project_id ? body.project_id : null;
  if (body.status === "planned" || body.status === "posted" || body.status === "skipped") {
    out.status = body.status;
    out.posted_at = body.status === "posted" ? new Date().toISOString() : null;
  }
  return out;
}

/** Plan a post (Pro). */
export async function POST(req: Request) {
  const a = await auth();
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasPro(a.user.id))) return NextResponse.json({ error: "The posting calendar is part of Pro and Studio.", code: "pro_required" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const row = fields(body);
  if (!row.post_on) return NextResponse.json({ error: "Pick a date." }, { status: 400 });
  if (row.project_id) {
    const { data: p } = await a.supabase.from("projects").select("id").eq("id", row.project_id as string).eq("user_id", a.user.id).maybeSingle();
    if (!p) row.project_id = null;
  }
  const { data, error } = await a.supabase.from("marketing_posts").insert({ ...row, user_id: a.user.id }).select("*").single();
  if (error) return NextResponse.json({ error: /marketing_posts/.test(error.message) ? MIGRATION_HINT : error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

export async function PATCH(req: Request) {
  const a = await auth();
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { data, error } = await a.supabase
    .from("marketing_posts")
    .update({ ...fields(body), updated_at: new Date().toISOString() })
    .eq("id", String(body.id || ""))
    .eq("user_id", a.user.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

export async function DELETE(req: Request) {
  const a = await auth();
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await a.supabase.from("marketing_posts").delete().eq("id", new URL(req.url).searchParams.get("id") || "").eq("user_id", a.user.id);
  return NextResponse.json({ ok: true });
}

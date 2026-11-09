import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { challengeStatus, parseChallengeInput, slugifyChallenge, type Challenge } from "@/lib/challenges";

const MIGRATION_HINT = "Database needs an update. Run supabase/migration_challenges.sql in the Supabase SQL editor.";

/** Platform challenges: any dates you choose. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { data, error } = await admin.from("challenges").select("*").eq("kind", "platform").order("starts_on", { ascending: false });
  if (error) return NextResponse.json({ error: /challenge/.test(error.message) ? MIGRATION_HINT : error.message }, { status: 500 });
  const challenges = (data || []) as Challenge[];
  const counts = await Promise.all(
    challenges.map(async (c) => {
      const [{ count }, { count: finished }] = await Promise.all([
        admin.from("challenge_participants").select("user_id", { count: "exact", head: true }).eq("challenge_id", c.id),
        admin.from("challenge_participants").select("user_id", { count: "exact", head: true }).eq("challenge_id", c.id).not("completed_at", "is", null),
      ]);
      return { participants: count || 0, finished: finished || 0 };
    })
  );
  const { count: groups } = await admin.from("challenges").select("id", { count: "exact", head: true }).eq("kind", "group");
  return NextResponse.json({
    challenges: challenges.map((c, i) => ({ ...c, status: challengeStatus(c), ...counts[i] })),
    groupChallenges: groups || 0,
  });
}

export async function POST(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseChallengeInput({ title: body.title, description: body.description, goal_words: body.goal_words, starts_on: body.starts_on, ends_on: body.ends_on });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  let slug = slugifyChallenge(String(body.slug || parsed.value.title || ""));
  const { data: taken } = await admin.from("challenges").select("id").eq("slug", slug).maybeSingle();
  if (taken) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const { data, error } = await admin
    .from("challenges")
    .insert({ ...parsed.value, slug, kind: "platform", is_public: true, created_by: user.id })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: /challenge/.test(error.message) ? MIGRATION_HINT : error.message }, { status: 500 });
  return NextResponse.json({ challenge: data });
}

export async function PATCH(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "");
  const parsed = parseChallengeInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data: current } = await auth.admin.from("challenges").select("starts_on, ends_on").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const starts = parsed.value.starts_on || current.starts_on;
  const ends = parsed.value.ends_on || current.ends_on;
  if (ends < starts) return NextResponse.json({ error: "The end date has to be on or after the start date." }, { status: 400 });
  const { data, error } = await auth.admin
    .from("challenges")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // New dates change which days count, so everyone's numbers are recomputed on their next visit
  if (parsed.value.starts_on || parsed.value.ends_on) {
    await auth.admin.from("challenge_participants").update({ last_computed_at: null }).eq("challenge_id", id);
  }
  return NextResponse.json({ challenge: data });
}

export async function DELETE(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id") || "";
  await auth.admin.from("challenges").delete().eq("id", id).eq("kind", "platform");
  return NextResponse.json({ ok: true });
}

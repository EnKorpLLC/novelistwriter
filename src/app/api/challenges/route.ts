import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { MAX_GROUP_CHALLENGES, challengeStatus, newJoinCode, parseChallengeInput, refreshParticipant, slugifyChallenge, type Challenge, type Participant } from "@/lib/challenges";

const MIGRATION_HINT = "Database needs an update. Run supabase/migration_challenges.sql in the Supabase SQL editor.";

/** The writer's challenges (joined or started), plus open public ones to join. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();

  const [{ data: mine, error }, { data: created }, { data: open }] = await Promise.all([
    admin.from("challenge_participants").select("*").eq("user_id", user.id),
    admin.from("challenges").select("*").eq("created_by", user.id).eq("kind", "group"),
    admin.from("challenges").select("*").eq("is_public", true).gte("ends_on", new Date().toISOString().slice(0, 10)).order("starts_on"),
  ]);
  if (error) return NextResponse.json({ error: /challenge/.test(error.message) ? MIGRATION_HINT : error.message, migrationNeeded: true }, { status: 500 });

  const ids = [...new Set([...(mine || []).map((p) => p.challenge_id), ...(created || []).map((c) => c.id)])];
  const { data: rows } = ids.length ? await admin.from("challenges").select("*").in("id", ids) : { data: [] as Challenge[] };
  const byId = new Map(((rows || []) as Challenge[]).map((c) => [c.id, c]));
  const joined = await Promise.all(
    ((mine || []) as Participant[]).map(async (p) => {
      const c = byId.get(p.challenge_id);
      return c ? { challenge: c, progress: await refreshParticipant(admin, c, p) } : null;
    })
  );
  const joinedIds = new Set((mine || []).map((p) => p.challenge_id));
  return NextResponse.json({
    joined: joined.filter(Boolean).map((j) => ({ ...j, status: challengeStatus(j!.challenge) })),
    created: ((created || []) as Challenge[]).filter((c) => !joinedIds.has(c.id)).map((c) => ({ challenge: c, status: challengeStatus(c) })),
    open: ((open || []) as Challenge[]).filter((c) => !joinedIds.has(c.id)).map((c) => ({ challenge: c, status: challengeStatus(c) })),
  });
}

/** Start a group challenge (free for everyone). The creator joins it automatically. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseChallengeInput({ title: body.title, description: body.description, goal_words: body.goal_words, starts_on: body.starts_on, ends_on: body.ends_on });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const admin = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await admin.from("challenges").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("kind", "group").gte("ends_on", today);
  if ((count || 0) >= MAX_GROUP_CHALLENGES) {
    return NextResponse.json({ error: `You can run up to ${MAX_GROUP_CHALLENGES} group challenges at a time.` }, { status: 400 });
  }

  const slug = `${slugifyChallenge(parsed.value.title || "challenge")}-${randomBytes(3).toString("hex")}`;
  const { data: challenge, error } = await admin
    .from("challenges")
    .insert({ ...parsed.value, slug, kind: "group", created_by: user.id, is_public: false, join_code: newJoinCode() })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: /challenge/.test(error.message) ? MIGRATION_HINT : error.message }, { status: 500 });
  const timeZone = typeof body.timeZone === "string" ? body.timeZone : "UTC";
  await admin.from("challenge_participants").insert({ challenge_id: challenge.id, user_id: user.id, time_zone: timeZone });
  return NextResponse.json({ challenge });
}

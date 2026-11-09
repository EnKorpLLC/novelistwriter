import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { TIMEZONE_COOKIE, isValidTimeZone } from "@/lib/local-day";
import { challengeStatus, refreshParticipant, type Challenge, type Participant } from "@/lib/challenges";

/** Join, leave, or change leaderboard visibility. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to join challenges.", code: "signin" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string; timeZone?: string; showOnLeaderboard?: boolean };

  const admin = createServiceClient();
  const { data: row } = await admin.from("challenges").select("*").eq("slug", slug).maybeSingle();
  const challenge = row as Challenge | null;
  if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  const { data: existing } = await admin.from("challenge_participants").select("*").eq("challenge_id", challenge.id).eq("user_id", user.id).maybeSingle();

  if (body.action === "join") {
    if (existing) return NextResponse.json({ ok: true, participant: existing });
    if (!challenge.is_public && challenge.created_by !== user.id && body.code !== challenge.join_code) {
      return NextResponse.json({ error: "This challenge needs its invite link." }, { status: 403 });
    }
    if (challengeStatus(challenge) === "ended") return NextResponse.json({ error: "This challenge has ended." }, { status: 400 });
    const jar = await cookies();
    const cookieTz = jar.get(TIMEZONE_COOKIE)?.value ? decodeURIComponent(jar.get(TIMEZONE_COOKIE)!.value) : "";
    const timeZone = [body.timeZone, cookieTz].find((tz): tz is string => typeof tz === "string" && isValidTimeZone(tz)) || "UTC";
    const { data: participant, error } = await admin
      .from("challenge_participants")
      .insert({ challenge_id: challenge.id, user_id: user.id, time_zone: timeZone })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Words already written since the start date count too
    const fresh = await refreshParticipant(admin, challenge, participant as Participant, true);
    return NextResponse.json({ ok: true, participant: fresh });
  }

  if (!existing) return NextResponse.json({ error: "You haven't joined this challenge." }, { status: 400 });

  if (body.action === "leave") {
    await admin.from("challenge_participants").delete().eq("challenge_id", challenge.id).eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "visibility") {
    await admin
      .from("challenge_participants")
      .update({ show_on_leaderboard: body.showOnLeaderboard !== false })
      .eq("challenge_id", challenge.id)
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "refresh") {
    const fresh = await refreshParticipant(admin, challenge, existing as Participant, true);
    return NextResponse.json({ ok: true, participant: fresh });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

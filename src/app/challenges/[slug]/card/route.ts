import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { renderShareImage } from "@/lib/og-image";
import type { Challenge } from "@/lib/challenges";

/** Share cards: the challenge itself, or one writer's progress (?u=userId) if they show on the leaderboard. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const userId = url.searchParams.get("u");
  const square = url.searchParams.get("size") === "square";
  const size = square ? { width: 1080, height: 1080 } : { width: 1200, height: 630 };
  const admin = createServiceClient();
  const { data } = await admin.from("challenges").select("*").eq("slug", slug).maybeSingle();
  const challenge = data as Challenge | null;
  if (!challenge) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (userId) {
    const [{ data: p }, { data: profile }] = await Promise.all([
      admin.from("challenge_participants").select("verified_words, current_streak, completed_at, show_on_leaderboard").eq("challenge_id", challenge.id).eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    ]);
    if (!p || !p.show_on_leaderboard) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const pct = Math.min(100, Math.round((p.verified_words / challenge.goal_words) * 100));
    return renderShareImage({
      ...size,
      kicker: "Verified writing challenge",
      title: `${profile?.display_name || "A writer"} wrote ${p.verified_words.toLocaleString()} words`,
      subtitle: `${challenge.title} · ${pct}% of ${challenge.goal_words.toLocaleString()}`,
      badge: p.completed_at ? "Winner · every word typed" : p.current_streak > 1 ? `${p.current_streak}-day streak` : "Every word typed, none pasted",
      image: null,
    });
  }

  if (!challenge.is_public) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { count } = await admin.from("challenge_participants").select("user_id", { count: "exact", head: true }).eq("challenge_id", challenge.id);
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return renderShareImage({
    ...size,
    kicker: "Free writing challenge",
    title: challenge.title,
    subtitle: `${f(challenge.starts_on)} – ${f(challenge.ends_on)} · ${challenge.goal_words.toLocaleString()} verified words`,
    badge: count ? `${count.toLocaleString()} writer${count === 1 ? "" : "s"} joined` : "Every word typed, none pasted",
    image: null,
  });
}

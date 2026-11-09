import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasPro, userHasStudio } from "@/lib/credits";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { normalizeDetails, normalizeFormat } from "@/lib/book/format";
import { getStyle } from "@/lib/book/styles";
import { TIMEZONE_COOKIE, dayInTimeZone, isValidTimeZone } from "@/lib/local-day";
import { STREAK_MIN_WORDS, daysBetween, verifiedWordsByDay } from "@/lib/challenges";
import { addDays } from "@/lib/launch-plan";

/** Everything the Marketing page needs: books for cards, verified writing progress, and the posting calendar. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const jar = await cookies();
  const rawTz = jar.get(TIMEZONE_COOKIE)?.value ? decodeURIComponent(jar.get(TIMEZONE_COOKIE)!.value) : "UTC";
  const tz = isValidTimeZone(rawTz) ? rawTz : "UTC";
  const today = dayInTimeZone(tz);

  const [pro, studio, { data: profile }, { data: projects }, byDay, { data: posts, error: postsError }, { data: joined }] = await Promise.all([
    userHasPro(user.id),
    userHasStudio(user.id),
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    admin.from("projects").select("id, title, subtitle, format_settings, book_details, cover_path, metadata, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
    verifiedWordsByDay(admin, user.id, tz, addDays(today, -60), today),
    admin.from("marketing_posts").select("*").eq("user_id", user.id).gte("post_on", addDays(today, -14)).lte("post_on", addDays(today, 90)).order("post_on"),
    admin.from("challenge_participants").select("challenge_id, verified_words").eq("user_id", user.id),
  ]);

  const sum = (from: string) => [...byDay.entries()].filter(([d]) => d >= from).reduce((n, [, w]) => n + w, 0);
  let streak = 0;
  for (const day of daysBetween(addDays(today, -60), today).reverse()) {
    if ((byDay.get(day) || 0) >= STREAK_MIN_WORDS) streak += 1;
    else if (day === today) continue;
    else break;
  }
  let challenge: { title: string; verified: number; goal: number } | null = null;
  if (joined?.length) {
    const { data: active } = await admin
      .from("challenges")
      .select("id, title, goal_words")
      .in("id", joined.map((j) => j.challenge_id))
      .lte("starts_on", today)
      .gte("ends_on", today)
      .limit(1)
      .maybeSingle();
    if (active) challenge = { title: active.title, goal: active.goal_words, verified: joined.find((j) => j.challenge_id === active.id)?.verified_words || 0 };
  }

  const penName = (p: { book_details: unknown }) => normalizeDetails(p.book_details).penName || profile?.display_name || "Author";
  return NextResponse.json({
    pro,
    studio,
    today,
    migrationNeeded: Boolean(postsError && /marketing_posts/.test(postsError.message)),
    books: (projects || []).map((p) => {
      const style = getStyle(normalizeFormat(p.format_settings).style);
      return {
        id: p.id,
        title: p.title || "Untitled",
        author: penName(p),
        coverUrl: coverPublicUrl(projectCoverPath(p), p.updated_at ? Date.parse(p.updated_at) : undefined),
        heading: style.heading,
        body: style.body,
      };
    }),
    progress: { today: byDay.get(today) || 0, week: sum(addDays(today, -6)), month: sum(addDays(today, -29)), streak, challenge },
    posts: posts || [],
  });
}

/** Checks that a quote really comes from the book, so the card can say "From the book". */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; text?: string };
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[“”"]/g, '"')
      .replace(/[‘’']/g, "'")
      .replace(/[—–]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  const quote = norm(String(body.text || ""));
  if (quote.length < 8) return NextResponse.json({ found: false });
  const { data: chapters } = await supabase.from("chapters").select("content_text").eq("project_id", String(body.projectId || "")).eq("user_id", user.id);
  const found = (chapters || []).some((c) => norm(String(c.content_text || "")).includes(quote));
  return NextResponse.json({ found });
}


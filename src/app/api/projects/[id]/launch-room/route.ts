import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { bookPath } from "@/lib/handles";
import { addDays } from "@/lib/launch-plan";

type Day = { day: string; views: number; clicks: number; signups: number; reviews: number; shares: number };

/** L4: the launch-week dashboard: visits, buy clicks, signups, reviews, and share visits by day. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userHasStudio(user.id))) return NextResponse.json({ studio: false });

  const today = new Date().toISOString().slice(0, 10);
  const anchor = project.release_date || (project.published_at ? String(project.published_at).slice(0, 10) : today);
  const from = addDays(anchor, -7);
  const to = addDays(anchor, 14) < today ? addDays(anchor, 14) : today;
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  const admin = createServiceClient();
  const { data: profile } = await admin.from("profiles").select("handle").eq("id", user.id).maybeSingle();
  const path = profile?.handle && project.slug ? bookPath(profile.handle, project.slug) : null;
  const sinceIso = `${from}T00:00:00Z`;

  const [views, clicks, subs, arcs, shares, team] = await Promise.all([
    path
      ? admin.from("site_page_views").select("day, visitor_hash").eq("path", path).gte("day", from).lte("day", to).limit(50000)
      : Promise.resolve({ data: [] as { day: string; visitor_hash: string }[] }),
    admin.from("buy_clicks").select("day, store, visitor_hash").eq("project_id", id).gte("day", from).lte("day", to).limit(50000),
    admin.from("author_subscribers").select("subscribed_at, release_project_ids").eq("author_user_id", user.id).gte("subscribed_at", sinceIso).limit(20000),
    admin.from("arc_invites").select("review_posts").eq("project_id", id).eq("status", "active"),
    path
      ? admin.from("share_visits").select("day, path").eq("referrer_user_id", user.id).gte("day", from).lte("day", to).limit(20000)
      : Promise.resolve({ data: [] as { day: string; path: string }[] }),
    admin.from("launch_team").select("user_id, tasks").eq("project_id", id),
  ]);

  const byDay = new Map<string, Day>(days.map((d) => [d, { day: d, views: 0, clicks: 0, signups: 0, reviews: 0, shares: 0 }]));
  const uniq = new Set<string>();
  for (const v of views.data || []) {
    const k = `${v.day}|${v.visitor_hash}`;
    if (uniq.has(k)) continue;
    uniq.add(k);
    const d = byDay.get(String(v.day));
    if (d) d.views += 1;
  }
  const stores = new Map<string, number>();
  for (const c of clicks.data || []) {
    const d = byDay.get(String(c.day));
    if (d) d.clicks += 1;
    stores.set(c.store, (stores.get(c.store) || 0) + 1);
  }
  for (const s of subs.data || []) {
    const d = byDay.get(String(s.subscribed_at).slice(0, 10));
    if (d) d.signups += 1;
  }
  let reviewsTotal = 0;
  for (const a of arcs.data || []) {
    for (const at of Object.values((a.review_posts as Record<string, string>) || {})) {
      reviewsTotal += 1;
      const d = byDay.get(String(at).slice(0, 10));
      if (d) d.reviews += 1;
    }
  }
  for (const s of shares.data || []) {
    if (path && !String(s.path || "").startsWith(path)) continue;
    const d = byDay.get(String(s.day));
    if (d) d.shares += 1;
  }

  const series = [...byDay.values()];
  const totals = series.reduce(
    (t, d) => ({ views: t.views + d.views, clicks: t.clicks + d.clicks, signups: t.signups + d.signups, reviews: t.reviews + d.reviews, shares: t.shares + d.shares }),
    { views: 0, clicks: 0, signups: 0, reviews: 0, shares: 0 }
  );
  const teamRows = team.data || [];
  return NextResponse.json({
    studio: true,
    anchor,
    today,
    series,
    totals: { ...totals, reviewsAllTime: reviewsTotal, team: teamRows.length, teamTasks: teamRows.reduce((n, t) => n + Object.keys(t.tasks || {}).length, 0) },
    stores: [...stores.entries()].map(([store, n]) => ({ store, clicks: n })).sort((a, b) => b.clicks - a.clicks),
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { userHasPro, userHasStudio } from "@/lib/credits";
import { authorPath, bookPath } from "@/lib/handles";
import { addDays } from "@/lib/launch-plan";
import { postCampaign, sourceLabel } from "@/lib/traffic-source";
import { appUrl } from "@/lib/stripe";

export const maxDuration = 30;

const RANGES = [30, 90, 365];
const DIRECT = "Direct or bookmarked";
const ON_SITE = "Novelist Writer";

type View = { id: number; day: string; path: string; referrer_host: string | null; utm_source: string | null; utm_campaign: string | null; visitor_hash: string };
type Visit = { source: string | null; campaign: string | null; paths: Set<string>; firstId: number };

/**
 * Marketing results: visitors to the author's site and book pages, where they came from, buy clicks
 * (credited to the visit that brought the reader), list growth (Studio), and which calendar posts worked.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [pro, studio] = await Promise.all([userHasPro(user.id), userHasStudio(user.id)]);
  if (!pro) return NextResponse.json({ pro: false, studio: false });

  const requested = Number(new URL(req.url).searchParams.get("days"));
  const days = RANGES.includes(requested) ? requested : 30;
  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -(days - 1));
  const admin = createServiceClient();

  const [{ data: profile }, { data: projects }] = await Promise.all([
    admin.from("profiles").select("handle").eq("id", user.id).maybeSingle(),
    admin.from("projects").select("id, title, slug, published, launch_public, arc_open, beta_ready").eq("user_id", user.id),
  ]);
  const handle = profile?.handle as string | null;
  if (!handle) return NextResponse.json({ pro, studio, days, noSite: true });
  const prefix = authorPath(handle);
  const books = (projects || []).map((p) => ({
    id: p.id as string,
    title: (p.title as string) || "Untitled",
    path: p.slug ? bookPath(handle, p.slug) : null,
    isPublic: Boolean(p.slug && (p.published || p.launch_public || p.arc_open || p.beta_ready)),
  }));
  const links = [
    { label: "Your author site", url: appUrl(prefix) },
    ...books.filter((b) => b.isPublic && b.path).map((b) => ({ label: b.title, url: appUrl(b.path!) })),
  ];

  // Page views on the author's pages; prefix match is narrowed in code so /a/jane doesn't pick up /a/janet
  const views = (
    await fetchAll<View>((f, t) =>
      admin
        .from("site_page_views")
        .select("id, day, path, referrer_host, utm_source, utm_campaign, visitor_hash")
        .like("path", `${prefix}%`)
        .gte("day", from)
        .lte("day", today)
        .order("id")
        .range(f, t)
    )
  ).filter((v) => v.path === prefix || v.path.startsWith(`${prefix}/`));

  // One visit per visitor per day (visitor ids rotate daily); its source is the first tagged view
  const visits = new Map<string, Visit>();
  for (const v of views) {
    const key = `${v.day}|${v.visitor_hash}`;
    const visit = visits.get(key) || { source: null, campaign: null, paths: new Set<string>(), firstId: v.id };
    if (!visit.source) visit.source = sourceLabel(v);
    if (!visit.campaign && v.utm_campaign) visit.campaign = v.utm_campaign;
    visit.paths.add(v.path);
    visits.set(key, visit);
  }

  // Untagged visits: did they start elsewhere on Novelist Writer (the catalog, a challenge), or come straight in?
  const untagged = [...visits.entries()].filter(([, v]) => !v.source).slice(0, 3000);
  const hashes = [...new Set(untagged.map(([k]) => k.split("|")[1]))];
  const elsewhere = new Map<string, string>();
  for (let i = 0; i < hashes.length; i += 150) {
    const { data } = await admin
      .from("site_page_views")
      .select("id, day, path, referrer_host, utm_source, visitor_hash")
      .in("visitor_hash", hashes.slice(i, i + 150))
      .gte("day", from)
      .order("id")
      .limit(1000);
    for (const r of data || []) {
      const key = `${r.day}|${r.visitor_hash}`;
      if (elsewhere.has(key) || r.id > (visits.get(key)?.firstId ?? 0) || r.path === prefix || String(r.path).startsWith(`${prefix}/`)) continue;
      elsewhere.set(key, sourceLabel(r) || ON_SITE);
    }
  }
  for (const [key, v] of untagged) v.source = elsewhere.get(key) || DIRECT;

  const bookIds = books.map((b) => b.id);
  const [clicks, subs, unsubs, listSize, { data: posts }] = await Promise.all([
    bookIds.length
      ? fetchAll<{ project_id: string; store: string; day: string; visitor_hash: string }>((f, t) =>
          admin.from("buy_clicks").select("project_id, store, day, visitor_hash").in("project_id", bookIds).gte("day", from).lte("day", today).order("id").range(f, t)
        )
      : Promise.resolve([]),
    studio
      ? fetchAll<{ subscribed_at: string; came_from?: string | null }>((f, t) =>
          admin
            .from("author_subscribers")
            .select("subscribed_at, came_from")
            .eq("author_user_id", user.id)
            .not("confirmed_at", "is", null)
            .gte("subscribed_at", `${from}T00:00:00Z`)
            .order("subscribed_at")
            .range(f, t)
        ).then(async (rows) =>
          rows.length
            ? rows
            : // Before migration_author_marketing.sql there is no came_from column
              fetchAll<{ subscribed_at: string }>((f, t) =>
                admin.from("author_subscribers").select("subscribed_at").eq("author_user_id", user.id).not("confirmed_at", "is", null).gte("subscribed_at", `${from}T00:00:00Z`).order("subscribed_at").range(f, t)
              )
        )
      : Promise.resolve([]),
    studio
      ? admin.from("author_subscribers").select("id", { count: "exact", head: true }).eq("author_user_id", user.id).gte("unsubscribed_at", `${from}T00:00:00Z`)
      : Promise.resolve({ count: 0 }),
    studio
      ? admin.from("author_subscribers").select("id", { count: "exact", head: true }).eq("author_user_id", user.id).not("confirmed_at", "is", null).is("unsubscribed_at", null)
      : Promise.resolve({ count: 0 }),
    admin.from("marketing_posts").select("id, post_on, network, note, body, status").eq("user_id", user.id).gte("post_on", addDays(from, -14)).lte("post_on", today),
  ]);

  // Buckets: daily for a month, weekly beyond
  const step = days <= 30 ? 1 : 7;
  const buckets: { start: string; visitors: number; clicks: number; signups: number }[] = [];
  for (let d = from; d <= today; d = addDays(d, step)) buckets.push({ start: d, visitors: 0, clicks: 0, signups: 0 });
  const bucketOf = (day: string) => buckets[Math.min(buckets.length - 1, Math.floor((Date.parse(day) - Date.parse(from)) / (step * 86_400_000)))];

  const sources = new Map<string, { visitors: number; clicks: number; signups: number }>();
  const src = (name: string) => sources.get(name) || sources.set(name, { visitors: 0, clicks: 0, signups: 0 }).get(name)!;
  const campaigns = new Map<string, { visitors: number; clicks: number }>();
  const camp = (name: string) => campaigns.get(name) || campaigns.set(name, { visitors: 0, clicks: 0 }).get(name)!;
  const perBook = new Map(books.map((b) => [b.id, { visitors: 0, clicks: 0, stores: new Map<string, number>() }]));

  for (const [key, v] of visits) {
    const day = key.split("|")[0];
    const b = bucketOf(day);
    if (b) b.visitors += 1;
    src(v.source || DIRECT).visitors += 1;
    if (v.campaign) camp(v.campaign).visitors += 1;
    for (const book of books) {
      if (book.path && [...v.paths].some((p) => p === book.path || p.startsWith(`${book.path}/`))) perBook.get(book.id)!.visitors += 1;
    }
  }
  for (const c of clicks) {
    const v = visits.get(`${c.day}|${c.visitor_hash}`);
    const b = bucketOf(String(c.day));
    if (b) b.clicks += 1;
    src(v?.source || DIRECT).clicks += 1;
    if (v?.campaign) camp(v.campaign).clicks += 1;
    const pb = perBook.get(c.project_id);
    if (pb) {
      pb.clicks += 1;
      pb.stores.set(c.store, (pb.stores.get(c.store) || 0) + 1);
    }
  }
  for (const s of subs as { subscribed_at: string; came_from?: string | null }[]) {
    const b = bucketOf(s.subscribed_at.slice(0, 10));
    if (b) b.signups += 1;
    src(s.came_from || "Not recorded").signups += 1;
  }

  const postResults = (posts || [])
    .map((p) => ({
      id: p.id as string,
      postOn: p.post_on as string,
      network: p.network as string,
      label: (p.note as string) || String(p.body || "").slice(0, 80) || "Post",
      status: p.status as string,
      ...(campaigns.get(postCampaign(p.id)) || { visitors: 0, clicks: 0 }),
    }))
    .filter((p) => p.status === "posted" || p.visitors || p.clicks)
    .sort((a, b) => b.clicks * 3 + b.visitors - (a.clicks * 3 + a.visitors))
    .slice(0, 10);

  return NextResponse.json({
    pro,
    studio,
    days,
    step,
    totals: {
      visitors: visits.size,
      pageViews: views.length,
      clicks: clicks.length,
      signups: subs.length,
      unsubscribes: unsubs.count || 0,
      listSize: listSize.count || 0,
    },
    series: buckets,
    sources: [...sources.entries()]
      .map(([source, n]) => ({ source, ...n }))
      .sort((a, b) => b.clicks * 3 + b.signups * 5 + b.visitors - (a.clicks * 3 + a.signups * 5 + a.visitors)),
    books: books
      .map((b) => {
        const r = perBook.get(b.id)!;
        return { id: b.id, title: b.title, visitors: r.visitors, clicks: r.clicks, stores: [...r.stores.entries()].map(([store, n]) => ({ store, clicks: n })).sort((x, y) => y.clicks - x.clicks) };
      })
      .filter((b) => b.visitors || b.clicks)
      .sort((a, b) => b.visitors - a.visitors),
    posts: postResults,
    links,
    capped: views.length >= 50000,
  });
}

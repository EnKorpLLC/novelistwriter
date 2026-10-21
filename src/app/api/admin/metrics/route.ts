import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export const maxDuration = 60;

const RANGES = [7, 30, 90];
const PAGE = 1000;
const MAX_ROWS = 50000;

/** Supabase returns at most 1,000 rows per request, so read in pages. */
async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error || !data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function count(q: PromiseLike<{ count: number | null }>) {
  return (await q).count || 0;
}

function top<T>(map: Map<string, T>, score: (v: T) => number, n = 15) {
  return [...map.entries()].sort((a, b) => score(b[1]) - score(a[1])).slice(0, n);
}

type View = {
  day: string;
  path: string;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  visitor_hash: string;
};

type NewProfile = {
  id: string;
  created_at: string;
  is_author: boolean | null;
  is_beta_reader: boolean | null;
  signup_source: Record<string, string | null> | null;
};

function sourceLabel(s: Record<string, string | null> | null | undefined) {
  if (!s) return "unknown";
  if (s.utm_source || s.utm_campaign) {
    return [s.utm_source, s.utm_medium, s.utm_campaign].filter(Boolean).join(" / ");
  }
  return s.referrer_host || "direct";
}

async function traffic(admin: SupabaseClient, sinceDay: string, newProfiles: NewProfile[]) {
  const views = await fetchAll<View>((from, to) =>
    admin
      .from("site_page_views")
      .select("day, path, referrer_host, utm_source, utm_medium, utm_campaign, visitor_hash")
      .gte("day", sinceDay)
      .order("id", { ascending: true })
      .range(from, to)
  );

  const visitorDays = new Set<string>();
  const daily = new Map<string, { visitors: Set<string>; pageviews: number; signups: number }>();
  const pages = new Map<string, { views: number; visitors: Set<string> }>();
  const referrers = new Map<string, number>();
  const campaigns = new Map<string, { arrivals: number; signups: number }>();

  for (const v of views) {
    visitorDays.add(`${v.day}|${v.visitor_hash}`);
    const d = daily.get(v.day) || { visitors: new Set<string>(), pageviews: 0, signups: 0 };
    d.visitors.add(v.visitor_hash);
    d.pageviews += 1;
    daily.set(v.day, d);
    const p = pages.get(v.path) || { views: 0, visitors: new Set<string>() };
    p.views += 1;
    p.visitors.add(`${v.day}|${v.visitor_hash}`);
    pages.set(v.path, p);
    if (v.referrer_host) referrers.set(v.referrer_host, (referrers.get(v.referrer_host) || 0) + 1);
    if (v.utm_source || v.utm_campaign) {
      const key = [v.utm_source, v.utm_medium, v.utm_campaign].filter(Boolean).join(" / ");
      const c = campaigns.get(key) || { arrivals: 0, signups: 0 };
      c.arrivals += 1;
      campaigns.set(key, c);
    }
  }

  const signupSources = new Map<string, number>();
  for (const p of newProfiles) {
    const day = p.created_at.slice(0, 10);
    const d = daily.get(day) || { visitors: new Set<string>(), pageviews: 0, signups: 0 };
    d.signups += 1;
    daily.set(day, d);
    const label = sourceLabel(p.signup_source);
    signupSources.set(label, (signupSources.get(label) || 0) + 1);
    if (p.signup_source?.utm_source || p.signup_source?.utm_campaign) {
      const c = campaigns.get(label) || { arrivals: 0, signups: 0 };
      c.signups += 1;
      campaigns.set(label, c);
    }
  }

  const arrivals = views.filter((v) => v.referrer_host || v.utm_source).length;
  return {
    pageviews: views.length,
    visitors: visitorDays.size,
    signups: newProfiles.length,
    conversion: visitorDays.size ? newProfiles.length / visitorDays.size : 0,
    externalArrivals: arrivals,
    capped: views.length >= MAX_ROWS,
    daily: [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, d]) => ({ day, visitors: d.visitors.size, pageviews: d.pageviews, signups: d.signups })),
    topPages: top(pages, (p) => p.views).map(([path, p]) => ({ path, views: p.views, visitors: p.visitors.size })),
    topReferrers: top(referrers, (n) => n).map(([host, n]) => ({ host, arrivals: n })),
    campaigns: top(campaigns, (c) => c.arrivals + c.signups * 10, 25).map(([name, c]) => ({
      name,
      arrivals: c.arrivals,
      signups: c.signups,
      conversion: c.arrivals ? c.signups / c.arrivals : 0,
    })),
    signupSources: top(signupSources, (n) => n).map(([source, n]) => ({ source, signups: n })),
  };
}

export async function GET(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const requested = Number(new URL(req.url).searchParams.get("days"));
  const days = RANGES.includes(requested) ? requested : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  const sinceDay = sinceIso.slice(0, 10);
  const nowIso = new Date().toISOString();

  const newProfiles = await fetchAll<NewProfile>((from, to) =>
    admin
      .from("profiles")
      .select("id, created_at, is_author, is_beta_reader, signup_source")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(from, to)
  );

  const [
    trafficData,
    authorsTotal,
    readersTotal,
    tiers,
    passRunning,
    aiOff,
    projectsTotal,
    projectsNew,
    aiJobs,
    betaOpen,
    arcOpen,
    launchPublic,
    published,
    sessions,
    writingDays,
    shareVisits,
    ledger,
    readingDays,
    betaActive,
    betaRequests,
    betaFinished,
    betaDnf,
    arcActive,
    arcRequests,
    arcFinished,
    reviews,
    comments,
    follows,
    subscribers,
    subscribersNew,
  ] = await Promise.all([
    traffic(admin, sinceDay, newProfiles),
    count(admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_author", true)),
    count(admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_beta_reader", true)),
    fetchAll<{ subscription_tier: string }>((f, t) => admin.from("credit_balances").select("subscription_tier").range(f, t)),
    count(admin.from("credit_balances").select("user_id", { count: "exact", head: true }).gt("pass_active_until", nowIso)),
    count(admin.from("profiles").select("id", { count: "exact", head: true }).eq("ai_disabled", true)),
    count(admin.from("projects").select("id", { count: "exact", head: true })),
    count(admin.from("projects").select("id", { count: "exact", head: true }).gte("created_at", sinceIso)),
    count(admin.from("ai_jobs").select("id", { count: "exact", head: true }).gte("created_at", sinceIso)),
    count(admin.from("projects").select("id", { count: "exact", head: true }).eq("beta_ready", true)),
    count(admin.from("projects").select("id", { count: "exact", head: true }).eq("arc_open", true).gt("arc_deadline", nowIso)),
    count(admin.from("projects").select("id", { count: "exact", head: true }).eq("launch_public", true)),
    count(admin.from("projects").select("id", { count: "exact", head: true }).eq("published", true)),
    fetchAll<{ user_id: string }>((f, t) =>
      admin.from("writing_sessions").select("user_id").gte("started_at", sinceIso).range(f, t)
    ),
    fetchAll<{ words_written: number }>((f, t) =>
      admin.from("writing_days").select("words_written").gte("day", sinceDay).range(f, t)
    ),
    count(admin.from("share_visits").select("id", { count: "exact", head: true }).gte("day", sinceDay)),
    fetchAll<{ credited_days: number; reason: string }>((f, t) =>
      admin.from("studio_pass_ledger").select("credited_days, reason").gte("created_at", sinceIso).range(f, t)
    ),
    fetchAll<{ user_id: string }>((f, t) =>
      admin.from("reader_activity_days").select("user_id").gte("day", sinceDay).range(f, t)
    ),
    count(admin.from("beta_invites").select("id", { count: "exact", head: true }).in("status", ["pending", "accepted"])),
    count(admin.from("beta_invites").select("id", { count: "exact", head: true }).gte("created_at", sinceIso)),
    count(admin.from("beta_invites").select("id", { count: "exact", head: true }).gte("finished_at", sinceIso)),
    count(admin.from("beta_invites").select("id", { count: "exact", head: true }).gte("dnf_at", sinceIso)),
    count(admin.from("arc_invites").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(admin.from("arc_invites").select("id", { count: "exact", head: true }).eq("status", "requested").gte("created_at", sinceIso)),
    count(admin.from("arc_invites").select("id", { count: "exact", head: true }).gte("finished_at", sinceIso)),
    count(admin.from("beta_book_reviews").select("id", { count: "exact", head: true }).gte("created_at", sinceIso)),
    count(admin.from("beta_comments").select("id", { count: "exact", head: true }).gte("created_at", sinceIso).not("invite_id", "is", null)),
    count(admin.from("beta_author_follows").select("id", { count: "exact", head: true })),
    count(admin.from("author_subscribers").select("id", { count: "exact", head: true }).not("confirmed_at", "is", null).is("unsubscribed_at", null)),
    count(admin.from("author_subscribers").select("id", { count: "exact", head: true }).gte("created_at", sinceIso)),
  ]);

  const plans = { free: 0, pro: 0, studio: 0 } as Record<string, number>;
  for (const t of tiers) plans[t.subscription_tier] = (plans[t.subscription_tier] || 0) + 1;
  const gifted = ledger.filter((l) => l.reason === "admin_gift").reduce((n, l) => n + l.credited_days, 0);
  const earned = ledger
    .filter((l) => l.credited_days > 0 && !["admin_gift", "returned_on_subscribe"].includes(l.reason))
    .reduce((n, l) => n + l.credited_days, 0);

  return NextResponse.json({
    days,
    since: sinceDay,
    traffic: trafficData,
    authors: {
      total: authorsTotal,
      new: newProfiles.filter((p) => p.is_author !== false).length,
      activeWriters: new Set(sessions.map((s) => s.user_id)).size,
      wordsWritten: writingDays.reduce((n, d) => n + (d.words_written || 0), 0),
      plans: { free: plans.free || 0, pro: plans.pro || 0, studio: plans.studio || 0, passRunning },
      aiOff,
      projectsTotal,
      projectsNew,
      aiJobs,
      betaOpen,
      arcOpen,
      launchPublic,
      published,
      shareVisits,
      passDaysEarned: earned,
      passDaysGifted: gifted,
    },
    readers: {
      total: readersTotal,
      new: newProfiles.filter((p) => p.is_beta_reader && p.is_author === false).length,
      activeReaders: new Set(readingDays.map((r) => r.user_id)).size,
      readingDays: readingDays.length,
      betaActive,
      betaRequests,
      betaFinished,
      betaDnf,
      arcActive,
      arcRequests,
      arcFinished,
      reviews,
      comments,
      follows,
      subscribers,
      subscribersNew,
    },
  });
}

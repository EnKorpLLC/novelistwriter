import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { AUTO_NETWORKS, MANUAL_NETWORKS, SOCIAL_MIGRATION_HINT, connectedNetworks, fillSocialQueue, publishPost, socialCampaign, taggedLink, type AutoNetwork, type SocialPost } from "@/lib/social-engine";

export const maxDuration = 60;

/** The review queue, recent posts with what each brought in, and which networks are connected. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const [queued, recent] = await Promise.all([
    admin.from("social_posts").select("*").eq("status", "queued").order("suggested_on").limit(50),
    admin.from("social_posts").select("*").neq("status", "queued").order("updated_at", { ascending: false }).limit(30),
  ]);
  if (queued.error) return NextResponse.json({ error: /social_posts/.test(queued.error.message) ? SOCIAL_MIGRATION_HINT : queued.error.message }, { status: 500 });

  // Visitors and signups each posted item brought, from its tagged links
  const posted = ((recent.data || []) as SocialPost[]).filter((p) => p.status === "posted");
  const campaigns = posted.map((p) => socialCampaign(p.id));
  const stats = new Map<string, { visitors: Set<string>; signups: number }>(campaigns.map((c) => [c, { visitors: new Set(), signups: 0 }]));
  if (campaigns.length) {
    const [{ data: views }, { data: signups }] = await Promise.all([
      admin.from("site_page_views").select("day, visitor_hash, utm_campaign").in("utm_campaign", campaigns).limit(20000),
      admin.from("profiles").select("signup_source").in("signup_source->>utm_campaign", campaigns).limit(5000),
    ]);
    for (const v of views || []) stats.get(v.utm_campaign)?.visitors.add(`${v.day}|${v.visitor_hash}`);
    for (const s of signups || []) {
      const c = (s.signup_source as { utm_campaign?: string } | null)?.utm_campaign;
      if (c && stats.has(c)) stats.get(c)!.signups += 1;
    }
  }
  const shape = (p: SocialPost) => ({
    ...p,
    links: Object.fromEntries([...AUTO_NETWORKS, ...MANUAL_NETWORKS].map((n) => [n, taggedLink(p, n)])),
    visitors: stats.get(socialCampaign(p.id))?.visitors.size || 0,
    signups: stats.get(socialCampaign(p.id))?.signups || 0,
  });
  return NextResponse.json({
    connected: connectedNetworks(),
    autoNetworks: AUTO_NETWORKS,
    manualNetworks: MANUAL_NETWORKS,
    queued: ((queued.data || []) as SocialPost[]).map(shape),
    recent: ((recent.data || []) as SocialPost[]).map(shape),
  });
}

/** Suggest today's posts now instead of waiting for the daily job. */
export async function POST() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const added = await fillSocialQueue(auth.admin);
  return NextResponse.json({ added });
}

/**
 * Review actions:
 *   { id, caption } saves an edit;
 *   { id, caption, post: ["bluesky"] } posts to connected networks;
 *   { id, manual: "instagram" } records that you posted it by hand;
 *   { id, skip: true } drops it.
 */
export async function PATCH(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const body = (await req.json().catch(() => ({}))) as { id?: string; caption?: string; post?: string[]; manual?: string; skip?: boolean };
  const { data } = await admin.from("social_posts").select("*").eq("id", String(body.id || "")).maybeSingle();
  const post = data as SocialPost | null;
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const caption = typeof body.caption === "string" && body.caption.trim() ? body.caption.trim().slice(0, 1000) : post.caption;
  const now = new Date().toISOString();

  if (body.skip) {
    await admin.from("social_posts").update({ status: "skipped", updated_at: now }).eq("id", post.id);
    return NextResponse.json({ ok: true });
  }
  if (body.manual && (MANUAL_NETWORKS as readonly string[]).concat(AUTO_NETWORKS).includes(body.manual)) {
    const results = { ...post.results, [body.manual]: { at: now, manual: true } };
    await admin.from("social_posts").update({ caption, results, status: "posted", posted_at: post.posted_at || now, updated_at: now }).eq("id", post.id);
    return NextResponse.json({ ok: true, results });
  }
  if (body.post?.length) {
    const networks = body.post.filter((n): n is AutoNetwork => (AUTO_NETWORKS as readonly string[]).includes(n));
    const results = await publishPost(admin, post, caption, networks);
    const failed = networks.filter((n) => results[n]?.error);
    return NextResponse.json({ ok: !failed.length, results, error: failed.length ? `${failed.join(", ")}: ${results[failed[0]]?.error}` : undefined });
  }
  await admin.from("social_posts").update({ caption, updated_at: now }).eq("id", post.id);
  return NextResponse.json({ ok: true });
}

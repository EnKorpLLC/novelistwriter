import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/stripe";
import { authorsWithPublicSites, rowHasStudio } from "@/lib/credits";
import { bookPath } from "@/lib/handles";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { genreLabel } from "@/lib/beta-platform";
import { isArcWindowOpen } from "@/lib/arc";
import { leaderboard, type Challenge } from "@/lib/challenges";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { addDays } from "@/lib/launch-plan";

export const SOCIAL_MIGRATION_HINT = "Database needs an update. Run supabase/migration_social_engine.sql in the Supabase SQL editor.";
export const POSTS_PER_DAY = 2;
/** Stop suggesting when this many posts are waiting for review */
const MAX_WAITING = 14;

export type SocialPost = {
  id: string;
  kind: string;
  ref_key: string;
  caption: string;
  link_path: string;
  image_title: string;
  image_subtitle: string;
  image_kicker: string;
  image_cover_url: string | null;
  project_id: string | null;
  author_user_id: string | null;
  status: "queued" | "posted" | "skipped";
  results: Record<string, { at: string; url?: string | null; error?: string | null; manual?: boolean }>;
  suggested_on: string;
  posted_at: string | null;
  created_at: string;
};

/** Networks we can post to automatically once their keys are set; the rest are download-and-post by hand. */
export const AUTO_NETWORKS = ["bluesky", "mastodon"] as const;
export const MANUAL_NETWORKS = ["instagram", "tiktok", "threads", "x", "facebook", "pinterest", "linkedin"] as const;
export type AutoNetwork = (typeof AUTO_NETWORKS)[number];

export function connectedNetworks(): AutoNetwork[] {
  const out: AutoNetwork[] = [];
  if (process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD) out.push("bluesky");
  if (process.env.MASTODON_URL && process.env.MASTODON_TOKEN) out.push("mastodon");
  return out;
}

export function socialCampaign(id: string) {
  return `nw-${id.replace(/-/g, "").slice(0, 10)}`;
}

/** The post's link, tagged so admin Metrics can show what each post brought in. */
export function taggedLink(post: Pick<SocialPost, "id" | "link_path">, network: string) {
  const u = new URL(appUrl(post.link_path));
  u.searchParams.set("utm_source", network);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", socialCampaign(post.id));
  return u.toString();
}

/** Same wording every time for the same thing, but different things get different openings. */
function variant<T>(key: string, options: T[]): T {
  const n = parseInt(createHash("sha1").update(key).digest("hex").slice(0, 8), 16);
  return options[n % options.length];
}

const shortDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const TIPS: { id: string; path: string; title: string; caption: string }[] = [
  { id: "spine", path: "/tools/spine-calculator", title: "How wide is your spine?", caption: "Paperback cover size depends on page count, trim, and paper. Our free calculator gives the exact wrap size for KDP and IngramSpark. No sign-up." },
  { id: "wordcount", path: "/tools/novel-word-count", title: "How long is a novel in your genre?", caption: "Romance, fantasy, thrillers, and YA all run different lengths. See typical word counts by genre, with page estimates." },
  { id: "trim", path: "/tools/trim-sizes", title: "Which trim size fits your book?", caption: "Trim size changes your page count, print cost, and how your book feels in the hand. A quick guide by genre." },
  { id: "pace", path: "/tools/writing-pace", title: "When will you finish?", caption: "Put in your goal and deadline and see the words a day it takes, or when you'll finish at your current pace." },
  { id: "readers", path: "/tools/where-readers-are", title: "Where are your readers?", caption: "Deal newsletters, ads, reader communities, and ARC services, with what each costs and what each allows for self-promotion." },
  { id: "human", path: "/challenges", title: "Every word typed, none pasted", caption: "Writing challenges where every word is verified: words count only if you typed them. Join one or start one with your group." },
];

type Candidate = Omit<SocialPost, "id" | "status" | "results" | "suggested_on" | "posted_at" | "created_at">;

/** Books from authors who opted in to being featured, with public pages. */
async function featuredAuthors(admin: SupabaseClient) {
  const { data } = await admin.from("profiles").select("id, display_name, handle").eq("feature_on_socials", true).not("handle", "is", null).limit(2000);
  const ids = (data || []).map((p) => p.id as string);
  const listed = await authorsWithPublicSites(ids);
  return new Map((data || []).filter((p) => listed.has(p.id)).map((p) => [p.id as string, { name: (p.display_name as string) || "An author", handle: p.handle as string }]));
}

async function candidates(admin: SupabaseClient, today: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const authors = await featuredAuthors(admin);
  const ids = [...authors.keys()];

  if (ids.length) {
    const { data: projects } = await admin
      .from("projects")
      .select("id, user_id, title, tagline, slug, genre, cover_path, metadata, updated_at, published, published_at, release_date, launch_public, arc_open, arc_deadline, beta_ready")
      .in("user_id", ids)
      .not("slug", "is", null)
      .limit(1000);
    const { data: tiers } = await admin.from("credit_balances").select("*").in("user_id", ids);
    const studio = new Set((tiers || []).filter((t) => rowHasStudio(t)).map((t) => t.user_id as string));
    for (const p of projects || []) {
      const a = authors.get(p.user_id)!;
      const genre = genreLabel(p.genre);
      const g = genre === "Uncategorized" ? "" : genre.toLowerCase();
      const base = {
        link_path: bookPath(a.handle, p.slug),
        image_title: p.title || "Untitled",
        image_subtitle: `by ${a.name}`,
        image_cover_url: coverPublicUrl(projectCoverPath(p), p.updated_at ? Date.parse(p.updated_at) : undefined),
        project_id: p.id,
        author_user_id: p.user_id,
      };
      const tagline = String(p.tagline || "").trim();
      if (p.published && p.published_at && p.published_at.slice(0, 10) >= addDays(today, -10)) {
        out.push({
          ...base,
          kind: "release",
          ref_key: `release:${p.id}`,
          image_kicker: "Out now",
          caption: clip(`${variant(p.id, ["New release:", "Out now:", "Just published:"])} ${p.title} by ${a.name}${g ? `, a ${g} novel` : ""}.${tagline ? ` ${tagline}` : ""} Written by its author, start to finish.`, 280),
        });
      } else if (!p.published && p.launch_public && p.release_date && p.release_date >= today && p.release_date <= addDays(today, 10)) {
        out.push({
          ...base,
          kind: "launch",
          ref_key: `launch:${p.id}`,
          image_kicker: `Out ${shortDate(p.release_date)}`,
          caption: clip(`Coming ${shortDate(p.release_date)}: ${p.title} by ${a.name}.${tagline ? ` ${tagline}` : ""} Get notified the day it's out.`, 280),
        });
      }
      if (studio.has(p.user_id) && isArcWindowOpen(p)) {
        out.push({
          ...base,
          kind: "arc",
          ref_key: `arc:${p.id}`,
          image_kicker: "Free advance copies",
          caption: clip(`Free advance copies: ${p.title} by ${a.name}${g ? ` (${g})` : ""}. Read it before release and leave an honest review.${p.arc_deadline ? ` Open until ${shortDate(p.arc_deadline)}.` : ""}`, 280),
        });
      }
      if (studio.has(p.user_id) && p.beta_ready) {
        out.push({
          ...base,
          kind: "beta",
          ref_key: `beta:${p.id}`,
          image_kicker: "Beta readers wanted",
          caption: clip(`Beta readers wanted: ${p.title}${g ? `, a ${g} novel` : ""} by ${a.name}. Read it free, comment on the page, and help shape the final book.`, 280),
        });
      }
    }
  }

  // Platform challenges: about to start, or just finished with a total to celebrate
  const { data: challenges } = await admin.from("challenges").select("*").eq("kind", "platform").eq("is_public", true).gte("ends_on", addDays(today, -7)).lte("starts_on", addDays(today, 5)).limit(10);
  for (const c of (challenges || []) as Challenge[]) {
    const link = { link_path: `/challenges/${c.slug}`, project_id: null, author_user_id: null, image_cover_url: null };
    if (c.starts_on >= today) {
      out.push({
        ...link,
        kind: "challenge",
        ref_key: `challenge-start:${c.id}`,
        image_kicker: "Free writing challenge",
        image_title: c.title,
        image_subtitle: `${shortDate(c.starts_on)} – ${shortDate(c.ends_on)} · ${c.goal_words.toLocaleString()} words`,
        caption: clip(`${c.title} starts ${shortDate(c.starts_on)}: ${c.goal_words.toLocaleString()} words by ${shortDate(c.ends_on)}. Every word is verified, so only words you type count. Free to join.`, 280),
      });
    } else if (c.ends_on < today) {
      const board = await leaderboard(admin, c, 1).catch(() => null);
      if (board && board.totalWords > 0) {
        out.push({
          ...link,
          kind: "challenge",
          ref_key: `challenge-done:${c.id}`,
          image_kicker: "Challenge complete",
          image_title: `${board.totalWords.toLocaleString()} verified words`,
          image_subtitle: `${board.participants.toLocaleString()} writers · ${c.title}`,
          caption: clip(`${c.title} is done: ${board.participants.toLocaleString()} writers typed ${board.totalWords.toLocaleString()} verified words. Every one written by hand, none pasted.`, 280),
        });
      }
    }
  }

  // Words written on Novelist Writer this month, at round milestones
  const month = today.slice(0, 7);
  const days = await fetchAll<{ words_written: number }>((f, t) => admin.from("writing_days").select("words_written").gte("day", `${month}-01`).lte("day", today).range(f, t), 20000).catch(() => []);
  const words = days.reduce((n, d) => n + (d.words_written || 0), 0);
  const milestone = [100_000_000, 50_000_000, 25_000_000, 10_000_000, 5_000_000, 2_500_000, 1_000_000, 500_000, 250_000, 100_000].find((m) => words >= m);
  if (milestone) {
    const label = milestone >= 1_000_000 ? `${milestone / 1_000_000} million` : milestone.toLocaleString();
    out.push({
      kind: "milestone",
      ref_key: `milestone:words:${month}:${milestone}`,
      link_path: "/",
      image_kicker: "Written by people",
      image_title: `${label} words this month`,
      image_subtitle: "written in Novelist Writer",
      image_cover_url: null,
      project_id: null,
      author_user_id: null,
      caption: `Writers on Novelist Writer have written ${label} words this month, every one of them by a person. Proof of who wrote a book, built into the writing app.`,
    });
  }

  // A tool tip each week, used when there's nothing fresher
  const week = `${today.slice(0, 4)}-${Math.ceil((Date.parse(today) - Date.parse(`${today.slice(0, 4)}-01-01`)) / (7 * 86_400_000) + 1)}`;
  const tip = variant(week, TIPS);
  out.push({
    kind: "tip",
    ref_key: `tip:${tip.id}:${week}`,
    link_path: tip.path,
    image_kicker: "Free author tool",
    image_title: tip.title,
    image_subtitle: "novelistwriter.com",
    image_cover_url: null,
    project_id: null,
    author_user_id: null,
    caption: tip.caption,
  });
  return out;
}

const PRIORITY: Record<string, number> = { release: 0, launch: 1, arc: 2, beta: 3, challenge: 4, milestone: 5, tip: 6 };

/** Daily: suggest up to two new posts for review, freshest news first. */
export async function fillSocialQueue(admin: SupabaseClient): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const [{ count: waiting, error }, { count: todays }] = await Promise.all([
    admin.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "queued"),
    admin.from("social_posts").select("id", { count: "exact", head: true }).eq("suggested_on", today),
  ]);
  if (error) return 0;
  const room = Math.min(POSTS_PER_DAY - (todays || 0), MAX_WAITING - (waiting || 0));
  if (room <= 0) return 0;
  const all = (await candidates(admin, today)).sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  const { data: existing } = await admin.from("social_posts").select("ref_key").in("ref_key", all.map((c) => c.ref_key));
  const taken = new Set((existing || []).map((e) => e.ref_key));
  // One post per author at a time, so a single author can't fill the feed
  const authorsUsed = new Set<string>();
  const picks: Candidate[] = [];
  for (const c of all) {
    if (picks.length >= room) break;
    if (taken.has(c.ref_key)) continue;
    if (c.author_user_id && authorsUsed.has(c.author_user_id)) continue;
    if (c.kind === "tip" && picks.length) continue;
    picks.push(c);
    if (c.author_user_id) authorsUsed.add(c.author_user_id);
  }
  if (!picks.length) return 0;
  await admin.from("social_posts").insert(picks.map((p) => ({ ...p, suggested_on: today })));
  return picks.length;
}

async function imageBytes(post: SocialPost): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(appUrl(`/social-image/${post.id}?size=wide`), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return { bytes: await res.arrayBuffer(), type: res.headers.get("content-type") || "image/png" };
  } catch {
    return null;
  }
}

async function postBluesky(post: SocialPost, caption: string): Promise<{ url: string }> {
  const service = (process.env.BLUESKY_SERVICE || "https://bsky.social").replace(/\/$/, "");
  const session = await fetch(`${service}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: process.env.BLUESKY_HANDLE, password: process.env.BLUESKY_APP_PASSWORD }),
  }).then((r) => r.json());
  if (!session.accessJwt) throw new Error(session.message || "Bluesky sign-in failed");
  const auth = { Authorization: `Bearer ${session.accessJwt}` };
  const link = taggedLink(post, "bluesky");
  let thumb: unknown;
  const img = await imageBytes(post);
  if (img) {
    const up = await fetch(`${service}/xrpc/com.atproto.repo.uploadBlob`, { method: "POST", headers: { ...auth, "Content-Type": img.type }, body: img.bytes }).then((r) => r.json());
    thumb = up.blob;
  }
  // The link card carries the link, so the text stays within Bluesky's 300 characters
  const res = await fetch(`${service}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text: clip(caption, 300),
        createdAt: new Date().toISOString(),
        embed: { $type: "app.bsky.embed.external", external: { uri: link, title: post.image_title || "Novelist Writer", description: post.image_subtitle || "", ...(thumb ? { thumb } : {}) } },
      },
    }),
  }).then((r) => r.json());
  if (!res.uri) throw new Error(res.message || "Bluesky post failed");
  return { url: `https://bsky.app/profile/${session.handle || process.env.BLUESKY_HANDLE}/post/${String(res.uri).split("/").pop()}` };
}

async function postMastodon(post: SocialPost, caption: string): Promise<{ url: string }> {
  const base = String(process.env.MASTODON_URL).replace(/\/$/, "");
  const auth = { Authorization: `Bearer ${process.env.MASTODON_TOKEN}` };
  const mediaIds: string[] = [];
  const img = await imageBytes(post);
  if (img) {
    const form = new FormData();
    form.append("file", new Blob([img.bytes], { type: img.type }), "post.png");
    form.append("description", `${post.image_kicker}: ${post.image_title} ${post.image_subtitle}`.trim());
    const media = await fetch(`${base}/api/v2/media`, { method: "POST", headers: auth, body: form }).then((r) => r.json());
    if (media.id) mediaIds.push(media.id);
  }
  const res = await fetch(`${base}/api/v1/statuses`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": `${post.id}-mastodon` },
    body: JSON.stringify({ status: `${clip(caption, 440)}\n\n${taggedLink(post, "mastodon")}`, media_ids: mediaIds }),
  }).then((r) => r.json());
  if (!res.url) throw new Error(res.error || "Mastodon post failed");
  return { url: res.url };
}

/** Posts to the chosen connected networks and records what happened on each. */
export async function publishPost(admin: SupabaseClient, post: SocialPost, caption: string, networks: AutoNetwork[]) {
  const results = { ...post.results };
  const connected = new Set(connectedNetworks());
  for (const n of networks) {
    if (!connected.has(n) || results[n]?.url) continue;
    try {
      const r = n === "bluesky" ? await postBluesky(post, caption) : await postMastodon(post, caption);
      results[n] = { at: new Date().toISOString(), url: r.url, error: null };
    } catch (err) {
      results[n] = { at: new Date().toISOString(), error: err instanceof Error ? err.message : "Post failed" };
    }
  }
  const anyPosted = Object.values(results).some((r) => r.url || r.manual);
  await admin
    .from("social_posts")
    .update({ caption, results, status: anyPosted ? "posted" : post.status, posted_at: anyPosted ? post.posted_at || new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", post.id);
  return results;
}

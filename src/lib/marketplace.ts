import "server-only";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/stripe";
import { renderEmail, sendEmail } from "@/lib/email";
import { enqueueEmails, processEmailQueue, type QueuedEmail } from "@/lib/email-queue";
import { notifyUser } from "@/lib/notifications";
import { signedDownloadUrl } from "@/lib/r2";
import {
  DEFAULT_OPEN_AT,
  MARKET_TYPES,
  PORTFOLIO_MAX,
  isMarketType,
  type MarketTypeId,
  type MarketTypeStatus,
  type PortfolioItem,
} from "@/lib/market-types";

export const MARKET_HINT = "The marketplace needs a database update. Run supabase/migration_marketplace.sql in the Supabase SQL editor.";

/** Hiring from the directory is built; a type still opens only when it has enough approved pros (or the admin forces it). */
export const HIRING_LIVE = true;

export const newCode = () => randomBytes(9).toString("base64url");

/** Every type with its counts and whether it's recruiting, ready, or open. Null before the migration. */
export async function typeStatuses(admin: SupabaseClient): Promise<MarketTypeStatus[] | null> {
  const [{ data: pros, error }, { data: waiting }, { data: settings }] = await Promise.all([
    admin.from("pro_profiles").select("specialties, status").in("status", ["approved", "applied", "changes"]).limit(10000),
    admin.from("market_waitlist").select("market_type").is("notified_at", null).limit(50000),
    admin.from("market_settings").select("*"),
  ]);
  if (error) return null;
  const bySetting = new Map((settings || []).map((s) => [s.market_type as string, s]));
  return MARKET_TYPES.map((t) => {
    const approved = (pros || []).filter((p) => p.status === "approved" && (p.specialties || []).includes(t.id)).length;
    const applied = (pros || []).filter((p) => p.status !== "approved" && (p.specialties || []).includes(t.id)).length;
    const s = bySetting.get(t.id);
    const threshold = Number(s?.threshold) || DEFAULT_OPEN_AT;
    const override = s?.override === "open" || s?.override === "closed" ? s.override : "auto";
    const enough = approved >= threshold;
    const state = override === "closed" ? (enough ? "ready" : "recruiting") : override === "open" || enough ? (HIRING_LIVE ? "open" : "ready") : "recruiting";
    return {
      id: t.id,
      label: t.label,
      plural: t.plural,
      blurb: t.blurb,
      group: t.group,
      approved,
      applied,
      waiting: (waiting || []).filter((w) => w.market_type === t.id).length,
      threshold,
      override,
      state,
    };
  });
}

export type ProRow = {
  user_id: string;
  name: string;
  headline: string;
  bio: string;
  specialties: string[];
  genres: string[];
  rate_note: string;
  turnaround_note: string;
  website: string;
  portfolio: unknown;
  status: string;
  promise_at: string | null;
  invite_code: string | null;
  invited_by: string | null;
  invite_id: string | null;
  admin_note: string;
  founding: boolean;
  submitted_at: string | null;
  approved_at: string | null;
};

export async function proFor(admin: SupabaseClient, userId: string): Promise<ProRow | null | undefined> {
  const { data, error } = await admin.from("pro_profiles").select("*").eq("user_id", userId).maybeSingle();
  return error ? undefined : ((data as ProRow | null) ?? null);
}

/**
 * Start a pro profile (draft). An admin invite's code fills in the type and lets them skip the queue;
 * another pro's code records who recruited them.
 */
export async function startPro(admin: SupabaseClient, userId: string, opts: { name?: string; invite?: string | null }) {
  const existing = await proFor(admin, userId);
  if (existing === undefined) throw new Error(MARKET_HINT);
  if (existing) return existing;
  const code = String(opts.invite || "").trim();
  let invitedBy: string | null = null;
  let inviteId: string | null = null;
  let specialties: string[] = [];
  if (/^[\w-]{6,40}$/.test(code)) {
    const { data: inv } = await admin.from("pro_invites").select("id, market_type, accepted_by").eq("code", code).maybeSingle();
    if (inv && !inv.accepted_by) {
      inviteId = inv.id as string;
      if (isMarketType(inv.market_type)) specialties = [inv.market_type];
      await admin.from("pro_invites").update({ accepted_by: userId, accepted_at: new Date().toISOString() }).eq("id", inv.id);
    } else if (!inv) {
      const { data: peer } = await admin.from("pro_profiles").select("user_id").eq("invite_code", code).maybeSingle();
      if (peer && peer.user_id !== userId) invitedBy = peer.user_id as string;
    }
  }
  // Narrators who already work here start with the narrator type
  const { data: profile } = await admin.from("profiles").select("display_name, is_narrator").eq("id", userId).maybeSingle();
  if (profile?.is_narrator && !specialties.length) specialties = ["narration"];
  const { data, error } = await admin
    .from("pro_profiles")
    .insert({
      user_id: userId,
      name: String(opts.name || profile?.display_name || "").trim().slice(0, 80),
      specialties,
      invite_code: newCode(),
      invited_by: invitedBy,
      invite_id: inviteId,
    })
    .select("*")
    .single();
  if (error) throw new Error(MARKET_HINT);
  await admin.from("profiles").update({ is_pro: true }).eq("id", userId);
  return data as ProRow;
}

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const safeUrl = (v: unknown) => {
  const s = clean(v, 300);
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : "";
};

/** Portfolio items as saved: links, images in our storage (only under this pro's folder), and before/after samples. */
export function normalizePortfolio(raw: unknown, userId: string): PortfolioItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, PORTFOLIO_MAX)
    .map((r) => {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const key = clean(o.key, 300);
      const item: PortfolioItem = { id: clean(o.id, 40) || newCode(), title: clean(o.title, 120), note: clean(o.note, 400) };
      const url = safeUrl(o.url);
      if (url) item.url = url;
      if (key.startsWith(`pros/${userId}/`) && !key.includes("..")) item.key = key;
      const before = clean(o.before, 4000);
      const after = clean(o.after, 4000);
      if (before && after) Object.assign(item, { before, after });
      return item;
    })
    .filter((i) => i.title || i.url || i.key || i.before);
}

/** Portfolio with short-lived links to view its images. */
export async function signPortfolio(raw: unknown, userId: string) {
  const items = normalizePortfolio(raw, userId);
  return Promise.all(items.map(async (i) => ({ ...i, imageUrl: i.key ? await signedDownloadUrl(i.key, 6 * 3600).catch(() => null) : null })));
}

export function profileFields(b: Record<string, unknown>, userId: string) {
  const list = (v: unknown, max: number, len: number) =>
    (Array.isArray(v) ? v : String(v || "").split(","))
      .map((x) => clean(x, len))
      .filter(Boolean)
      .slice(0, max);
  return {
    name: clean(b.name, 80),
    headline: clean(b.headline, 140),
    bio: clean(b.bio, 2000),
    specialties: list(b.specialties, 7, 20).filter(isMarketType),
    genres: list(b.genres, 12, 40),
    rate_note: clean(b.rateNote, 160),
    turnaround_note: clean(b.turnaroundNote, 160),
    website: safeUrl(b.website),
    portfolio: normalizePortfolio(b.portfolio, userId),
  };
}

/** What's missing before an application can be sent, or null. */
export function applicationProblem(p: ReturnType<typeof profileFields>, promised: boolean) {
  if (!p.name) return "Add your name.";
  if (!p.specialties.length) return "Pick at least one thing you do.";
  if (!p.headline) return "Add a one-line headline.";
  if (p.bio.length < 80) return "Tell authors a little more about yourself (a few sentences).";
  if (p.portfolio.length < 2 && !p.website) return "Add at least two portfolio pieces, or a link to your portfolio.";
  if (!promised) return "Read and accept the human-made promise.";
  return null;
}

const adminEmail = () => (process.env.PLATFORM_ADMIN_EMAIL || "ryan.jamison87@gmail.com").trim().toLowerCase();

/** Tell the admin a new application is waiting. */
export async function emailNewApplication(admin: SupabaseClient, name: string, types: string[]) {
  const labels = types.map((t) => MARKET_TYPES.find((m) => m.id === t)?.label || t).join(", ");
  const mail = renderEmail({
    heading: "New marketplace application",
    paragraphs: [`${name || "Someone"} applied as: ${labels}.`],
    button: { label: "Review it", url: appUrl("/admin?tab=marketplace") },
  });
  await sendEmail({ to: adminEmail(), subject: `Marketplace application: ${name || "new pro"}`, html: mail.html, text: mail.text }).catch(() => null);
}

/** Approve, decline, or ask for changes; the pro hears why. Founding pros are the ones approved before their type opens. */
export async function reviewPro(admin: SupabaseClient, userId: string, decision: "approve" | "decline" | "changes", note: string) {
  const row = await proFor(admin, userId);
  if (!row) throw new Error("Application not found");
  const statuses = (await typeStatuses(admin)) || [];
  const founding = statuses.some((s) => row.specialties.includes(s.id) && s.state !== "open");
  const now = new Date().toISOString();
  const status = decision === "approve" ? "approved" : decision === "decline" ? "declined" : "changes";
  await admin
    .from("pro_profiles")
    .update({ status, admin_note: note.slice(0, 1000), updated_at: now, ...(decision === "approve" ? { approved_at: now, founding: row.founding || founding } : {}) })
    .eq("user_id", userId);
  const copy =
    decision === "approve"
      ? {
          title: founding ? "You're in: a founding pro on Novelist Writer" : "You're in the Novelist Writer marketplace",
          body: founding
            ? "Your profile is approved. Your type opens to authors once enough pros join; invite others with your link to open it sooner."
            : "Your profile is approved and authors can find you.",
        }
      : decision === "changes"
        ? { title: "A few changes to your marketplace profile", body: note || "Take another look at your profile and send it again." }
        : { title: "About your marketplace application", body: note || "We can't add your profile right now." };
  await notifyUser(admin, userId, { type: "application_update", title: copy.title, body: copy.body, href: "/pro" }).catch(() => null);
}

/** Invite someone to apply; the link skips the queue when the invite says so. */
export async function invitePro(admin: SupabaseClient, opts: { email: string; type: MarketTypeId; skipQueue: boolean; note: string }) {
  const code = newCode();
  const { error } = await admin.from("pro_invites").insert({ code, email: opts.email, market_type: opts.type, skip_queue: opts.skipQueue, note: opts.note });
  if (error) throw new Error(MARKET_HINT);
  const t = MARKET_TYPES.find((m) => m.id === opts.type)!;
  const mail = renderEmail({
    heading: `An invitation to join Novelist Writer as a ${t.label.toLowerCase()}`,
    paragraphs: [
      opts.note || `We're building a marketplace where authors hire human ${t.plural.toLowerCase()}, and we'd love you to be one of the first.`,
      "One fee, paid by the author and shown on every quote, so you keep your full price. Payments are held until each milestone is delivered, so you're never chasing money. Every pro promises their work is human-made.",
      opts.skipQueue ? "This link lets you skip the waiting list: set up your profile and you're in." : "Set up your profile and we'll review it.",
    ],
    button: { label: "Join as a founding pro", url: appUrl(`/pros/join?invite=${code}`) },
  });
  const sent = await sendEmail({ to: opts.email, subject: `Join Novelist Writer as a founding ${t.label.toLowerCase()}`, html: mail.html, text: mail.text }).catch(() => null);
  if (!sent?.ok) throw new Error("The invite was saved, but the email didn't send. Check email settings, then try again.");
  return code;
}

export type DirectoryPro = {
  userId: string;
  name: string;
  headline: string;
  bio: string;
  genres: string[];
  rateNote: string;
  turnaroundNote: string;
  website: string;
  founding: boolean;
  specialties: string[];
  completed: number;
  /** From completed jobs only */
  rating: { avg: number; count: number } | null;
  portfolio: (PortfolioItem & { imageUrl: string | null })[];
};

/** Approved pros for a type, founding pros first, then by completed jobs. Images are short-lived links. */
export async function directoryPros(admin: SupabaseClient, type: MarketTypeId, opts: { withPortfolio?: boolean; userId?: string } = {}): Promise<DirectoryPro[]> {
  let q = admin.from("pro_profiles").select("*").eq("status", "approved").contains("specialties", [type]);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data, error } = await q.limit(200);
  if (error || !data?.length) return [];
  const ids = data.map((r) => r.user_id as string);
  const [{ data: done }, { data: reviews }] = await Promise.all([
    admin.from("market_jobs").select("pro_id").in("pro_id", ids).eq("status", "completed"),
    admin.from("market_reviews").select("pro_id, stars").in("pro_id", ids),
  ]);
  const count = (id: string) => (done || []).filter((d) => d.pro_id === id).length;
  const rating = (id: string) => {
    const mine = (reviews || []).filter((r) => r.pro_id === id);
    return mine.length ? { avg: Math.round((mine.reduce((n, r) => n + r.stars, 0) / mine.length) * 10) / 10, count: mine.length } : null;
  };
  const rows = (data as ProRow[]).map((r) => ({ r, completed: count(r.user_id) })).sort((a, b) => Number(b.r.founding) - Number(a.r.founding) || b.completed - a.completed);
  return Promise.all(
    rows.map(async ({ r, completed }) => ({
      userId: r.user_id,
      name: r.name,
      headline: r.headline,
      bio: r.bio,
      genres: r.genres,
      rateNote: r.rate_note,
      turnaroundNote: r.turnaround_note,
      website: r.website,
      founding: r.founding,
      specialties: r.specialties,
      completed,
      rating: rating(r.user_id),
      portfolio: opts.withPortfolio ? await signPortfolio(r.portfolio, r.user_id) : [],
    }))
  );
}

/** Daily: a type that just opened emails its waitlist and tells its pros. */
export async function announceOpenedTypes(admin: SupabaseClient) {
  const statuses = await typeStatuses(admin);
  if (!statuses) return 0;
  const { data: settings } = await admin.from("market_settings").select("market_type, opened_at");
  const opened = new Set((settings || []).filter((s) => s.opened_at).map((s) => s.market_type as string));
  let sent = 0;
  for (const t of statuses.filter((s) => s.state === "open" && !opened.has(s.id))) {
    await admin.from("market_settings").upsert({ market_type: t.id, opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "market_type" });
    const { data: list } = await admin.from("market_waitlist").select("id, email").eq("market_type", t.id).is("notified_at", null).limit(5000);
    const queue: QueuedEmail[] = (list || []).map((w) => {
      const mail = renderEmail({
        heading: `${t.plural} are open on Novelist Writer`,
        paragraphs: [`You asked to hear when you could hire ${t.plural.toLowerCase()}. ${t.approved} are ready for your book, and every one has promised their work is human-made.`],
        button: { label: `See ${t.plural.toLowerCase()}`, url: appUrl(`/hire#${t.id}`) },
      });
      return { to: w.email as string, subject: `${t.plural} are open on Novelist Writer`, html: mail.html, text: mail.text };
    });
    if (queue.length) await enqueueEmails(admin, queue);
    await admin.from("market_waitlist").update({ notified_at: new Date().toISOString() }).in("id", (list || []).map((w) => w.id));
    sent += queue.length;
  }
  if (sent) await processEmailQueue(admin, { timeBudgetMs: 15_000 }).catch(() => null);
  return sent;
}

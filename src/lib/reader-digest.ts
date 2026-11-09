import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "@/lib/email";
import { appUrl } from "@/lib/stripe";
import { digestOneClickUrl, digestUnsubscribeUrl, enqueueEmails, type QueuedEmail } from "@/lib/email-queue";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { launchingThisWeek } from "@/lib/spotlight";
import { listPublishedBooks } from "@/lib/public-books";
import { loadPublicPromos, promoPath } from "@/lib/cross-promo";
import { isArcWindowOpen } from "@/lib/arc";
import { rowHasStudio } from "@/lib/credits";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { genreLabel } from "@/lib/beta-platform";
import { addDays } from "@/lib/launch-plan";
/** Thursdays, UTC: the daily job queues digests on this day. */
export const DIGEST_WEEKDAY = 4;

export type DigestItem = { id: string; title: string; authorName: string; authorUserId: string; genre: string; coverUrl: string | null; url: string; note: string };
export type DigestPromo = { title: string; url: string; books: number; endsOn: string };
export type DigestContent = { launching: DigestItem[]; newBooks: DigestItem[]; arcs: DigestItem[]; promos: DigestPromo[] };
export type DigestSection = { heading: string; items: DigestItem[] };

const tag = (url: string) => {
  const u = new URL(url, appUrl("/"));
  u.searchParams.set("utm_source", "digest");
  u.searchParams.set("utm_medium", "email");
  return u.toString();
};
const shortDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** What's new this week, shared by every reader's digest. */
export async function digestContent(admin: SupabaseClient): Promise<DigestContent> {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const [launching, published, promos, { data: arcRows }] = await Promise.all([
    launchingThisWeek(admin, 12).catch(() => []),
    listPublishedBooks(admin).catch(() => []),
    loadPublicPromos(admin, { current: true }).catch(() => []),
    admin.from("projects").select("id, title, genre, cover_path, metadata, updated_at, user_id, arc_open, arc_deadline").eq("arc_open", true).order("arc_deadline").limit(100),
  ]);

  const arcOpen = (arcRows || []).filter((p) => isArcWindowOpen(p));
  const arcAuthors = [...new Set(arcOpen.map((p) => p.user_id as string))];
  const [{ data: tiers }, { data: names }] = arcAuthors.length
    ? await Promise.all([admin.from("credit_balances").select("*").in("user_id", arcAuthors), admin.from("profiles").select("id, display_name").in("id", arcAuthors)])
    : [{ data: [] }, { data: [] }];
  const studio = new Set((tiers || []).filter((t) => rowHasStudio(t)).map((t) => t.user_id as string));
  const nameOf = new Map((names || []).map((n) => [n.id as string, (n.display_name as string) || "An author"]));

  const launchIds = new Set(launching.map((b) => b.id));
  return {
    launching: launching.map((b) => ({
      id: b.id,
      title: b.title,
      authorName: b.authorName,
      authorUserId: b.authorUserId,
      genre: b.genre,
      coverUrl: b.coverUrl,
      url: tag(b.href),
      note: b.out ? "Out now" : b.releaseDate ? `Out ${shortDate(b.releaseDate)}` : "Coming soon",
    })),
    newBooks: published
      .filter((b) => b.publishedAt && Date.parse(b.publishedAt) >= weekAgo && !launchIds.has(b.id))
      .slice(0, 12)
      .map((b) => ({ id: b.id, title: b.title, authorName: b.authorName, authorUserId: b.authorUserId, genre: b.genre, coverUrl: b.coverUrl, url: tag(b.href), note: "New this week" })),
    arcs: arcOpen
      .filter((p) => studio.has(p.user_id))
      .slice(0, 12)
      .map((p) => ({
        id: p.id,
        title: p.title || "Untitled",
        authorName: nameOf.get(p.user_id) || "An author",
        authorUserId: p.user_id,
        genre: genreLabel(p.genre),
        coverUrl: coverPublicUrl(projectCoverPath(p), p.updated_at ? Date.parse(p.updated_at) : undefined),
        url: tag("/beta/dashboard?tab=catalog"),
        note: p.arc_deadline ? `Free advance copy, read by ${shortDate(p.arc_deadline)}` : "Free advance copy",
      })),
    promos: promos
      .filter((p) => p.startsOn <= addDays(today, 7))
      .slice(0, 3)
      .map((p) => ({ title: p.title, url: tag(promoPath(p.slug)), books: p.books.length, endsOn: p.endsOn })),
  };
}

/** One reader's digest: authors they follow first, then their genres if they picked any. Null when there's nothing to send. */
export function personalDigest(c: DigestContent, opts: { genres: string[]; follows: Set<string> }): { sections: DigestSection[]; promos: DigestPromo[]; followed: number } | null {
  const want = opts.genres.map((g) => g.trim().toLowerCase()).filter(Boolean);
  const fits = (i: DigestItem) => !want.length || want.some((g) => i.genre.toLowerCase().includes(g) || g.includes(i.genre.toLowerCase()));
  const all = [...c.launching, ...c.newBooks, ...c.arcs];
  const followed = all.filter((i, n) => opts.follows.has(i.authorUserId) && all.findIndex((x) => x.id === i.id) === n);
  const shown = new Set(followed.map((i) => i.id));
  // Nothing at all in their genres this week: show everything rather than an empty email
  const anyFit = [...c.launching, ...c.newBooks, ...c.arcs].some((i) => !shown.has(i.id) && fits(i));
  const pick = (items: DigestItem[], max: number) =>
    items.filter((i) => !shown.has(i.id) && (anyFit ? fits(i) : true)).slice(0, max);
  const sections: DigestSection[] = [
    { heading: "From authors you follow", items: followed.slice(0, 6) },
    { heading: "Launching this week", items: pick(c.launching, 6) },
    { heading: "New on the shelf", items: pick(c.newBooks, 8) },
    { heading: "Free advance copies", items: pick(c.arcs, 6) },
  ].filter((s) => s.items.length);
  if (!sections.length && !c.promos.length) return null;
  return { sections, promos: c.promos, followed: followed.length };
}

export function renderDigest(d: NonNullable<ReturnType<typeof personalDigest>>, email: string): { subject: string; html: string; text: string } {
  const count = d.sections.reduce((n, s) => n + s.items.length, 0);
  const subject = d.followed
    ? `New from authors you follow, and ${Math.max(0, count - d.followed)} more books this week`
    : count
      ? `${count} books for you this week`
      : "Book promotions running this week";
  const unsubscribe = digestUnsubscribeUrl(email);
  // One small table per book, so books without a cover don't leave an empty column
  const item = (i: DigestItem) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>${
    i.coverUrl
      ? `<td style="padding:0 14px 16px 0;vertical-align:top;width:64px"><a href="${escapeHtml(i.url)}"><img src="${escapeHtml(i.coverUrl)}" alt="" width="60" style="display:block;width:60px;height:auto;border:0"></a></td>`
      : ""
  }<td style="padding:0 0 16px;vertical-align:top"><a href="${escapeHtml(i.url)}" style="color:#1a1612;font-size:17px;text-decoration:none">${escapeHtml(i.title)}</a><br><span style="font-size:13px;color:#6b6358">by ${escapeHtml(i.authorName)}${i.genre && i.genre !== "Uncategorized" ? ` · ${escapeHtml(i.genre)}` : ""}</span><br><span style="font-size:13px;color:#2c5f4a">${escapeHtml(i.note)}</span></td></tr></table>`;
  const sectionsHtml = d.sections
    .map((s) => `<h2 style="font-size:15px;font-weight:normal;letter-spacing:.08em;text-transform:uppercase;color:#2c5f4a;margin:26px 0 12px">${escapeHtml(s.heading)}</h2>${s.items.map(item).join("")}`)
    .join("");
  const promosHtml = d.promos.length
    ? `<h2 style="font-size:15px;font-weight:normal;letter-spacing:.08em;text-transform:uppercase;color:#2c5f4a;margin:26px 0 12px">Book promotions</h2>${d.promos
        .map((p) => `<p style="margin:0 0 10px"><a href="${escapeHtml(p.url)}" style="color:#1a1612">${escapeHtml(p.title)}</a> <span style="font-size:13px;color:#6b6358">· ${p.books} books · until ${shortDate(p.endsOn)}</span></p>`)
        .join("")}`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f2e9;font-family:Georgia,serif;color:#1a1612">
<div style="max-width:560px;margin:0 auto;padding:28px 24px">
<p style="font-size:20px;margin:0 0 6px"><a href="${escapeHtml(tag("/books"))}" style="color:#1a1612;text-decoration:none">Novelist Writer</a></p>
<p style="margin:0 0 8px;font-size:14px;color:#6b6358">Your weekly reading list. Every book here was written by its author, not by AI.</p>
${sectionsHtml}${promosHtml}
<p style="margin:26px 0 0"><a href="${escapeHtml(tag("/books"))}" style="background:#2c5f4a;color:#fff;padding:10px 18px;text-decoration:none;display:inline-block">Browse all books</a></p>
<p style="margin:28px 0 0;font-size:12px;color:#6b6358">You're getting this because you turned on the weekly reader digest. <a href="${escapeHtml(appUrl("/settings"))}" style="color:#6b6358">Change your genres</a> or <a href="${escapeHtml(unsubscribe)}" style="color:#6b6358">unsubscribe</a>.</p>
</div></body></html>`;
  const text = [
    "Your weekly reading list from Novelist Writer",
    "",
    ...d.sections.flatMap((s) => [s.heading.toUpperCase(), ...s.items.map((i) => `- ${i.title} by ${i.authorName} (${i.note}): ${i.url}`), ""]),
    ...(d.promos.length ? ["BOOK PROMOTIONS", ...d.promos.map((p) => `- ${p.title}, ${p.books} books: ${p.url}`), ""] : []),
    `Browse all books: ${tag("/books")}`,
    "",
    `Change your genres: ${appUrl("/settings")}`,
    `Unsubscribe: ${unsubscribe}`,
  ].join("\n");
  return { subject, html, text };
}

/** Queues this week's digest for every reader who turned it on. Safe to re-run: each reader is queued once a day at most. */
export async function queueWeeklyDigest(admin: SupabaseClient, opts: { timeBudgetMs?: number } = {}): Promise<{ queued: number; skipped: number }> {
  const stopAt = Date.now() + (opts.timeBudgetMs ?? 20_000);
  const today = new Date().toISOString().slice(0, 10);
  const readers = await fetchAll<{ id: string; email: string | null; reader_digest_genres: string; reader_digest_sent_on: string | null }>((f, t) =>
    admin.from("profiles").select("id, email, reader_digest_genres, reader_digest_sent_on").eq("reader_digest", true).order("id").range(f, t)
  );
  const due = readers.filter((r) => r.email && (!r.reader_digest_sent_on || r.reader_digest_sent_on < addDays(today, -5)));
  if (!due.length) return { queued: 0, skipped: 0 };
  const content = await digestContent(admin);

  let queued = 0;
  let skipped = 0;
  for (let i = 0; i < due.length && Date.now() < stopAt; i += 300) {
    const chunk = due.slice(i, i + 300);
    const { data: follows } = await admin.from("beta_author_follows").select("reader_user_id, author_user_id").in("reader_user_id", chunk.map((r) => r.id));
    const followsOf = new Map<string, Set<string>>();
    for (const f of follows || []) (followsOf.get(f.reader_user_id) || followsOf.set(f.reader_user_id, new Set()).get(f.reader_user_id)!).add(f.author_user_id);
    const mails: QueuedEmail[] = [];
    for (const r of chunk) {
      const d = personalDigest(content, { genres: r.reader_digest_genres.split(","), follows: followsOf.get(r.id) || new Set() });
      if (!d) {
        skipped += 1;
        continue;
      }
      const m = renderDigest(d, r.email!);
      mails.push({ to: r.email!, subject: m.subject, html: m.html, text: m.text, listUnsubscribe: digestOneClickUrl(r.email!), kind: "digest" });
    }
    if (mails.length) await enqueueEmails(admin, mails);
    await admin.from("profiles").update({ reader_digest_sent_on: today }).in("id", chunk.map((r) => r.id));
    queued += mails.length;
  }
  return { queued, skipped };
}

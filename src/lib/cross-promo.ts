import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/beta-social";
import { optedInUserIds } from "@/lib/notifications";
import { renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/stripe";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { authorPath, bookPath } from "@/lib/handles";
import { authorsWithPublicSites } from "@/lib/credits";
import { normalizeBuyLinks } from "@/lib/arc";
import { addDays } from "@/lib/launch-plan";

export const CROSS_PROMO_MIGRATION_HINT = "Database needs an update. Run supabase/migration_cross_promo.sql in the Supabase SQL editor.";

export function isMissingTable(message: string | undefined) {
  return /swap_listings|promo_swaps|group_promos|group_promo_books|schema cache|does not exist/i.test(String(message || ""));
}

/** List sizes are shown as ranges: honest enough to match partners, without publishing exact numbers. */
export function listSizeRange(n: number): string {
  if (n < 100) return "Under 100 readers";
  if (n < 500) return "100–499 readers";
  if (n < 1000) return "500–999 readers";
  if (n < 5000) return "1,000–4,999 readers";
  return "5,000+ readers";
}

/** Confirmed, still-subscribed readers per author, counted from the list itself. */
export async function verifiedListSizes(admin: SupabaseClient, userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      const { count } = await admin
        .from("author_subscribers")
        .select("id", { count: "exact", head: true })
        .eq("author_user_id", id)
        .not("confirmed_at", "is", null)
        .is("unsubscribed_at", null);
      out.set(id, count || 0);
    })
  );
  return out;
}

/** Swaps where this author sent their side: the reliability number partners see. */
export async function completedSwaps(admin: SupabaseClient, userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(userIds.map((id) => [id, 0]));
  if (!userIds.length) return out;
  const [{ data: asFrom }, { data: asTo }] = await Promise.all([
    admin.from("promo_swaps").select("from_user").in("from_user", userIds).eq("status", "accepted").not("from_sent_at", "is", null),
    admin.from("promo_swaps").select("to_user").in("to_user", userIds).eq("status", "accepted").not("to_sent_at", "is", null),
  ]);
  for (const r of asFrom || []) out.set(r.from_user, (out.get(r.from_user) || 0) + 1);
  for (const r of asTo || []) out.set(r.to_user, (out.get(r.to_user) || 0) + 1);
  return out;
}

export type BookCard = { id: string; userId: string; title: string; genre: string; coverUrl: string | null; url: string | null; authorName: string; handle: string | null };

/** What a partner needs to see about a book: cover, title, author, and the public page to send readers to. */
export async function bookCards(admin: SupabaseClient, projectIds: string[]): Promise<Map<string, BookCard>> {
  const ids = [...new Set(projectIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data: rows } = await admin
    .from("projects")
    .select("id, user_id, title, slug, genre, cover_path, metadata, updated_at, published, launch_public, arc_open, beta_ready, book_details")
    .in("id", ids);
  const userIds = [...new Set((rows || []).map((r) => r.user_id as string))];
  const { data: profiles } = userIds.length ? await admin.from("profiles").select("id, display_name, handle").in("id", userIds) : { data: [] };
  const byId = new Map((profiles || []).map((p) => [p.id as string, p as { display_name: string | null; handle: string | null }]));
  return new Map(
    (rows || []).map((r) => {
      const p = byId.get(r.user_id);
      const handle = p?.handle || null;
      const isPublic = Boolean(r.slug && (r.published || r.launch_public || r.arc_open || r.beta_ready));
      const penName = String((r.book_details as { penName?: string } | null)?.penName || "").trim();
      return [
        r.id as string,
        {
          id: r.id,
          userId: r.user_id,
          title: r.title || "Untitled",
          genre: r.genre || "",
          coverUrl: coverPublicUrl(projectCoverPath(r), r.updated_at ? Date.parse(r.updated_at) : undefined),
          url: handle ? appUrl(isPublic ? bookPath(handle, r.slug) : authorPath(handle)) : null,
          authorName: penName || p?.display_name || "Author",
          handle,
        },
      ];
    })
  );
}

export type PublicPromo = {
  id: string;
  slug: string;
  title: string;
  genre: string;
  description: string;
  startsOn: string;
  endsOn: string;
  hostName: string;
  books: {
    id: string;
    title: string;
    authorName: string;
    coverUrl: string | null;
    href: string;
    blurb: string;
    priceNote: string;
    buyLinks: { label: string; url: string }[];
  }[];
};

/** Promos readers can see: open (not cancelled or hidden), with at least two approved books from authors whose pages are public. */
export async function loadPublicPromos(admin: SupabaseClient, opts: { slug?: string; current?: boolean } = {}): Promise<PublicPromo[]> {
  const today = new Date().toISOString().slice(0, 10);
  let q = admin.from("group_promos").select("*").eq("status", "open");
  if (opts.slug) q = q.eq("slug", opts.slug);
  if (opts.current) q = q.gte("ends_on", today).lte("starts_on", addDays(today, 14));
  const { data: promos, error } = await q.order("starts_on").limit(opts.slug ? 1 : 60);
  if (error || !promos?.length) return [];
  const { data: rows } = await admin.from("group_promo_books").select("promo_id, project_id, user_id, price_note, created_at").in("promo_id", promos.map((p) => p.id)).eq("status", "approved").order("created_at");
  const projectIds = [...new Set((rows || []).map((r) => r.project_id as string))];
  const [cards, listed, { data: projects }, { data: hosts }] = await Promise.all([
    bookCards(admin, projectIds),
    authorsWithPublicSites((rows || []).map((r) => r.user_id as string)),
    projectIds.length ? admin.from("projects").select("id, blurb, buy_links, published").in("id", projectIds) : Promise.resolve({ data: [] as { id: string; blurb: string | null; buy_links: unknown; published: boolean }[] }),
    admin.from("profiles").select("id, display_name").in("id", promos.map((p) => p.host_user_id)),
  ]);
  const extra = new Map((projects || []).map((p) => [p.id as string, p]));
  const hostName = new Map((hosts || []).map((h) => [h.id as string, (h.display_name as string) || "An author"]));
  return promos
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      genre: p.genre,
      description: p.description,
      startsOn: p.starts_on,
      endsOn: p.ends_on,
      hostName: hostName.get(p.host_user_id) || "An author",
      books: (rows || [])
        .filter((r) => r.promo_id === p.id && listed.has(r.user_id))
        .map((r) => {
          const card = cards.get(r.project_id);
          const e = extra.get(r.project_id);
          if (!card?.url) return null;
          const links = normalizeBuyLinks(e?.buy_links).filter((l) => (e?.published ? !l.preorder : true));
          return {
            id: card.id,
            title: card.title,
            authorName: card.authorName,
            coverUrl: card.coverUrl,
            href: card.url.replace(/^https?:\/\/[^/]+/, ""),
            blurb: String(e?.blurb || "").trim().slice(0, 240),
            priceNote: r.price_note || "",
            buyLinks: links.map((l) => ({ label: l.label, url: l.url })),
          };
        })
        .filter((b): b is NonNullable<typeof b> => Boolean(b)),
    }))
    .filter((p) => p.books.length >= 2 || opts.slug);
}

export function swapCampaign(swapId: string) {
  return `s-${swapId.replace(/-/g, "").slice(0, 10)}`;
}

export function promoPath(slug: string) {
  return `/promos/${slug}`;
}

/** In-app always; email when the author turned on notification emails. */
export async function notifyAuthor(admin: SupabaseClient, userId: string, n: { title: string; body: string; href: string }) {
  await createNotification(admin, { userId, type: "cross_promo", title: n.title, body: n.body, href: n.href }).catch(() => null);
  const [ok, { data: profile }] = await Promise.all([optedInUserIds(admin, [userId]), admin.from("profiles").select("email").eq("id", userId).maybeSingle()]);
  if (!ok.has(userId) || !profile?.email) return;
  const mail = renderEmail({ heading: n.title, paragraphs: [n.body], button: { label: "Open", url: appUrl(n.href) }, notification: true });
  await sendEmail({ to: profile.email, subject: n.title, text: mail.text, html: mail.html }).catch(() => null);
}

/** Puts an agreed send or share day on an author's marketing calendar (once). */
export async function addToCalendar(
  admin: SupabaseClient,
  row: { userId: string; postOn: string; network: string; note: string; body: string; planKey: string; projectId?: string | null }
) {
  const { data: existing } = await admin.from("marketing_posts").select("id").eq("user_id", row.userId).eq("plan_key", row.planKey).maybeSingle();
  const fields = { post_on: row.postOn, network: row.network, note: row.note, body: row.body, project_id: row.projectId || null };
  if (existing) await admin.from("marketing_posts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", existing.id);
  else await admin.from("marketing_posts").insert({ ...fields, user_id: row.userId, plan_key: row.planKey, card: "none" });
}

export async function removeFromCalendar(admin: SupabaseClient, planKey: string) {
  await admin.from("marketing_posts").delete().eq("plan_key", planKey).eq("status", "planned");
}

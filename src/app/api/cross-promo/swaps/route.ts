import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { rowHasStudio, userHasStudio } from "@/lib/credits";
import { isValidDayString } from "@/lib/local-day";
import { addDays } from "@/lib/launch-plan";
import { trackedUrl } from "@/lib/traffic-source";
import {
  CROSS_PROMO_MIGRATION_HINT,
  addToCalendar,
  bookCards,
  completedSwaps,
  isMissingTable,
  listSizeRange,
  notifyAuthor,
  removeFromCalendar,
  swapCampaign,
  verifiedListSizes,
} from "@/lib/cross-promo";

type Swap = {
  id: string;
  from_user: string;
  to_user: string;
  from_project: string | null;
  to_project: string | null;
  from_send_on: string;
  to_send_on: string;
  message: string;
  status: "requested" | "accepted" | "declined" | "cancelled";
  from_sent_at: string | null;
  to_sent_at: string | null;
  created_at: string;
};

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The swap board, your listing, and your swaps with how many readers each side's send brought. */
export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const studio = await userHasStudio(user.id);
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: listing, error: listingErr }, { data: myProjects }, { data: swapRows }] = await Promise.all([
    admin.from("swap_listings").select("project_id, genres, note, open").eq("user_id", user.id).maybeSingle(),
    admin.from("projects").select("id, title").eq("user_id", user.id).order("updated_at", { ascending: false }),
    admin.from("promo_swaps").select("*").or(`from_user.eq.${user.id},to_user.eq.${user.id}`).order("created_at", { ascending: false }).limit(100),
  ]);
  if (listingErr && isMissingTable(listingErr.message)) return NextResponse.json({ studio, migrationNeeded: true });

  // Board: other Studio authors who are open to swaps
  const { data: open } = await admin.from("swap_listings").select("user_id, project_id, genres, note, updated_at").eq("open", true).neq("user_id", user.id).not("project_id", "is", null).limit(300);
  const openIds = (open || []).map((o) => o.user_id as string);
  const { data: tiers } = openIds.length ? await admin.from("credit_balances").select("user_id, subscription_tier, pass_active_until").in("user_id", openIds) : { data: [] };
  const studioIds = new Set((tiers || []).filter((t) => rowHasStudio(t)).map((t) => t.user_id as string));
  const board = (open || []).filter((o) => studioIds.has(o.user_id));

  const swaps = (swapRows || []) as Swap[];
  const partnerIds = swaps.map((s) => (s.from_user === user.id ? s.to_user : s.from_user));
  const [cards, sizes, done] = await Promise.all([
    bookCards(admin, [...board.map((b) => b.project_id as string), ...swaps.flatMap((s) => [s.from_project || "", s.to_project || ""])]),
    verifiedListSizes(admin, [user.id, ...board.map((b) => b.user_id as string), ...partnerIds]),
    completedSwaps(admin, [...board.map((b) => b.user_id as string), ...partnerIds]),
  ]);

  // Visitors each side's send brought, counted from the tracked links in the swap
  const campaigns = swaps.filter((s) => s.status === "accepted").map((s) => swapCampaign(s.id));
  const visitors = new Map<string, Set<string>>();
  if (campaigns.length) {
    const { data: views } = await admin.from("site_page_views").select("day, visitor_hash, utm_campaign, utm_source").in("utm_campaign", campaigns).limit(5000);
    for (const v of views || []) {
      const key = `${v.utm_campaign}|${v.utm_source}`;
      (visitors.get(key) || visitors.set(key, new Set()).get(key)!).add(`${v.day}|${v.visitor_hash}`);
    }
  }
  const { data: handles } = await admin.from("profiles").select("id, handle").in("id", [user.id, ...partnerIds]);
  const handleOf = new Map((handles || []).map((h) => [h.id as string, (h.handle as string | null) || ""]));
  const sentBy = (s: Swap, sender: string) => visitors.get(`${swapCampaign(s.id)}|swap-${handleOf.get(sender) || "author"}`)?.size || 0;

  return NextResponse.json({
    studio,
    today,
    listing: listing || null,
    myListRange: listSizeRange(sizes.get(user.id) || 0),
    myBooks: (myProjects || []).map((p) => ({ id: p.id, title: p.title || "Untitled" })),
    board: board
      .map((b) => ({
        userId: b.user_id,
        book: cards.get(b.project_id as string) || null,
        genres: b.genres,
        note: b.note,
        listRange: listSizeRange(sizes.get(b.user_id) || 0),
        listSize: sizes.get(b.user_id) || 0,
        completed: done.get(b.user_id) || 0,
      }))
      .filter((b) => b.book),
    swaps: swaps.map((s) => {
      const mine = s.from_user === user.id;
      const partner = mine ? s.to_user : s.from_user;
      const myBook = cards.get((mine ? s.from_project : s.to_project) || "");
      const theirBook = cards.get((mine ? s.to_project : s.from_project) || "");
      return {
        id: s.id,
        role: mine ? "from" : "to",
        status: s.status,
        message: s.message,
        partnerName: theirBook?.authorName || "Author",
        partnerListRange: listSizeRange(sizes.get(partner) || 0),
        partnerCompleted: done.get(partner) || 0,
        myBook: myBook ? { title: myBook.title } : null,
        theirBook: theirBook ? { title: theirBook.title, url: theirBook.url, coverUrl: theirBook.coverUrl } : null,
        mySendOn: mine ? s.from_send_on : s.to_send_on,
        theirSendOn: mine ? s.to_send_on : s.from_send_on,
        iSent: Boolean(mine ? s.from_sent_at : s.to_sent_at),
        theySent: Boolean(mine ? s.to_sent_at : s.from_sent_at),
        // The link I put in my newsletter, tagged so we can count what it brings my partner
        myLink: theirBook?.url ? trackedUrl(theirBook.url, `swap-${handleOf.get(user.id) || "author"}`, swapCampaign(s.id)) : null,
        visitorsFromMe: sentBy(s, user.id),
        visitorsFromThem: sentBy(s, partner),
      };
    }),
  });
}

/** Your swap listing: open or closed, which book, genres, and a short note. */
export async function PUT(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasStudio(user.id))) return NextResponse.json({ error: "Newsletter swaps are part of Studio.", code: "studio_required" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; genres?: string; note?: string; open?: boolean };
  const admin = createServiceClient();
  let projectId: string | null = null;
  if (body.projectId) {
    const { data: p } = await admin.from("projects").select("id").eq("id", body.projectId).eq("user_id", user.id).maybeSingle();
    projectId = p?.id || null;
  }
  const { error } = await admin.from("swap_listings").upsert({
    user_id: user.id,
    project_id: projectId,
    genres: String(body.genres || "").slice(0, 120),
    note: String(body.note || "").slice(0, 400),
    open: body.open !== false,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? CROSS_PROMO_MIGRATION_HINT : error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Ask another author to swap. */
export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasStudio(user.id))) return NextResponse.json({ error: "Newsletter swaps are part of Studio.", code: "studio_required" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { toUser?: string; projectId?: string; mySendOn?: string; theirSendOn?: string; message?: string };
  const today = new Date().toISOString().slice(0, 10);
  const latest = addDays(today, 120);
  const okDay = (d?: string) => Boolean(d && isValidDayString(d) && d >= today && d <= latest);
  if (!okDay(body.mySendOn) || !okDay(body.theirSendOn)) return NextResponse.json({ error: "Pick send days between today and four months from now." }, { status: 400 });
  if (!body.toUser || body.toUser === user.id) return NextResponse.json({ error: "Pick an author to swap with." }, { status: 400 });

  const admin = createServiceClient();
  const [{ data: mine }, { data: theirs }, theyHaveStudio, { data: pending }] = await Promise.all([
    admin.from("projects").select("id, title").eq("id", String(body.projectId || "")).eq("user_id", user.id).maybeSingle(),
    admin.from("swap_listings").select("project_id, open").eq("user_id", body.toUser).maybeSingle(),
    userHasStudio(body.toUser),
    admin.from("promo_swaps").select("id").eq("status", "requested").or(`and(from_user.eq.${user.id},to_user.eq.${body.toUser}),and(from_user.eq.${body.toUser},to_user.eq.${user.id})`).limit(1),
  ]);
  if (!mine) return NextResponse.json({ error: "Pick one of your books to feature." }, { status: 400 });
  if (!theirs?.open || !theirs.project_id || !theyHaveStudio) return NextResponse.json({ error: "That author isn't taking swaps right now." }, { status: 400 });
  if (pending?.length) return NextResponse.json({ error: "There's already a swap request waiting between you two." }, { status: 400 });

  const { data: swap, error } = await admin
    .from("promo_swaps")
    .insert({
      from_user: user.id,
      to_user: body.toUser,
      from_project: mine.id,
      to_project: theirs.project_id,
      from_send_on: body.mySendOn,
      to_send_on: body.theirSendOn,
      message: String(body.message || "").slice(0, 600),
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? CROSS_PROMO_MIGRATION_HINT : error.message }, { status: 500 });

  const { data: me } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  await notifyAuthor(admin, body.toUser, {
    title: `${me?.display_name || "An author"} wants to swap newsletters`,
    body: `They'd feature your book on ${body.mySendOn} and ask you to feature ${mine.title} on ${body.theirSendOn}.`,
    href: "/dashboard/cross-promo",
  });
  return NextResponse.json({ ok: true, id: swap.id });
}

/** accept / decline (the asked author), cancel (either, before both have sent), sent (either, once accepted). */
export async function PATCH(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string };
  const admin = createServiceClient();
  const { data: row } = await admin.from("promo_swaps").select("*").eq("id", String(body.id || "")).maybeSingle();
  const s = row as Swap | null;
  if (!s || (s.from_user !== user.id && s.to_user !== user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const mine = s.from_user === user.id;
  const partner = mine ? s.to_user : s.from_user;
  const now = new Date().toISOString();
  const { data: me } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const myName = me?.display_name || "Your swap partner";
  const set = (patch: Record<string, unknown>) => admin.from("promo_swaps").update({ ...patch, updated_at: now }).eq("id", s.id);

  if (body.action === "accept" || body.action === "decline") {
    if (mine || s.status !== "requested") return NextResponse.json({ error: "This swap can't be answered now." }, { status: 400 });
    if (body.action === "decline") {
      await set({ status: "declined" });
      await notifyAuthor(admin, partner, { title: `${myName} passed on your swap`, body: "No hard feelings. There are other authors on the swap board.", href: "/dashboard/cross-promo" });
      return NextResponse.json({ ok: true });
    }
    if (!(await userHasStudio(user.id))) return NextResponse.json({ error: "Newsletter swaps are part of Studio.", code: "studio_required" }, { status: 403 });
    await set({ status: "accepted" });
    const cards = await bookCards(admin, [s.from_project || "", s.to_project || ""]);
    const { data: handles } = await admin.from("profiles").select("id, handle").in("id", [s.from_user, s.to_user]);
    const handleOf = new Map((handles || []).map((h) => [h.id as string, (h.handle as string | null) || "author"]));
    // Each side's calendar gets its send day, with the partner's book and a link tagged to this swap
    for (const [who, sendOn, featured] of [
      [s.from_user, s.from_send_on, cards.get(s.to_project || "")],
      [s.to_user, s.to_send_on, cards.get(s.from_project || "")],
    ] as const) {
      if (!featured) continue;
      const link = featured.url ? trackedUrl(featured.url, `swap-${handleOf.get(who)}`, swapCampaign(s.id)) : "";
      await addToCalendar(admin, {
        userId: who,
        postOn: sendOn,
        network: "newsletter",
        note: `Newsletter swap: feature ${featured.title} by ${featured.authorName}`,
        body: [`${featured.title} by ${featured.authorName}`, link].filter(Boolean).join("\n"),
        planKey: `swap:${s.id}`,
      });
    }
    await notifyAuthor(admin, partner, { title: `${myName} accepted your swap`, body: "Both send days are on your marketing calendars, with the link to use.", href: "/dashboard/cross-promo" });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "cancel") {
    if (s.status !== "requested" && s.status !== "accepted") return NextResponse.json({ error: "This swap is already closed." }, { status: 400 });
    if (s.from_sent_at && s.to_sent_at) return NextResponse.json({ error: "Both sides have sent; this swap is done." }, { status: 400 });
    await set({ status: "cancelled" });
    await removeFromCalendar(admin, `swap:${s.id}`);
    await notifyAuthor(admin, partner, { title: `${myName} cancelled a newsletter swap`, body: "It's off both calendars.", href: "/dashboard/cross-promo" });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "sent") {
    if (s.status !== "accepted") return NextResponse.json({ error: "Only accepted swaps can be marked sent." }, { status: 400 });
    await set(mine ? { from_sent_at: now } : { to_sent_at: now });
    await admin.from("marketing_posts").update({ status: "posted", posted_at: now }).eq("user_id", user.id).eq("plan_key", `swap:${s.id}`);
    await notifyAuthor(admin, partner, { title: `${myName} sent your book to their readers`, body: "Visits from their newsletter show on the swap and in your marketing results.", href: "/dashboard/cross-promo" });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

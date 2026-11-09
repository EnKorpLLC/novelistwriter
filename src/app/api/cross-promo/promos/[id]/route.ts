import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasPro } from "@/lib/credits";
import { appUrl } from "@/lib/stripe";
import { trackedUrl } from "@/lib/traffic-source";
import { addToCalendar, bookCards, notifyAuthor, promoPath, removeFromCalendar } from "@/lib/cross-promo";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createServiceClient();
  const { data: promo } = await admin.from("group_promos").select("*").eq("id", id).maybeSingle();
  return { user, admin, promo };
}

async function shareLink(admin: ReturnType<typeof createServiceClient>, userId: string, slug: string) {
  const { data: p } = await admin.from("profiles").select("handle").eq("id", userId).maybeSingle();
  return trackedUrl(appUrl(promoPath(slug)), `promo-${p?.handle || "author"}`);
}

/** Everything about one promo: books and their status, your share link, and who brought readers. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const { user, admin, promo } = await load(id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!promo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isHost = promo.host_user_id === user.id;
  const { data: rows } = await admin.from("group_promo_books").select("project_id, user_id, status, price_note, created_at").eq("promo_id", id).order("created_at");
  const mine = (rows || []).filter((r) => r.user_id === user.id);
  if (!isHost && !mine.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const visible = isHost ? rows || [] : (rows || []).filter((r) => r.status === "approved" || r.user_id === user.id);
  const cards = await bookCards(admin, visible.map((r) => r.project_id));

  // Readers each participant's share brought to the promo page, and buy clicks on it
  const path = promoPath(promo.slug);
  const [{ data: views }, { data: clicks }] = await Promise.all([
    admin.from("site_page_views").select("day, visitor_hash, utm_source").eq("path", path).limit(20000),
    admin.from("buy_clicks").select("project_id").eq("source", `promo-${promo.slug}`).limit(20000),
  ]);
  const bySource = new Map<string, Set<string>>();
  for (const v of views || []) {
    const k = String(v.utm_source || "");
    (bySource.get(k) || bySource.set(k, new Set()).get(k)!).add(`${v.day}|${v.visitor_hash}`);
  }
  const allVisitors = new Set((views || []).map((v) => `${v.day}|${v.visitor_hash}`)).size;
  const clicksByBook = new Map<string, number>();
  for (const c of clicks || []) clicksByBook.set(c.project_id, (clicksByBook.get(c.project_id) || 0) + 1);

  return NextResponse.json({
    promo: {
      id: promo.id,
      slug: promo.slug,
      title: promo.title,
      genre: promo.genre,
      description: promo.description,
      startsOn: promo.starts_on,
      endsOn: promo.ends_on,
      applyBy: promo.apply_by,
      maxBooks: promo.max_books,
      status: promo.status,
      url: appUrl(path),
    },
    isHost,
    shareLink: await shareLink(admin, user.id, promo.slug),
    visitors: allVisitors,
    books: visible.map((r) => {
      const card = cards.get(r.project_id);
      return {
        projectId: r.project_id,
        mine: r.user_id === user.id,
        status: r.status,
        priceNote: r.price_note,
        title: card?.title || "Untitled",
        authorName: card?.authorName || "Author",
        coverUrl: card?.coverUrl || null,
        url: card?.url || null,
        // Readers this author's share link brought in
        shared: card?.handle ? bySource.get(`promo-${card.handle}`)?.size || 0 : 0,
        clicks: clicksByBook.get(r.project_id) || 0,
      };
    }),
  });
}

/** Join with a book (Pro). The host's own books go straight in. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { user, admin, promo } = await load(id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!promo || promo.status !== "open") return NextResponse.json({ error: "This promo isn't taking books." }, { status: 404 });
  if (!(await userHasPro(user.id))) return NextResponse.json({ error: "Joining group promos is part of Pro and Studio.", code: "pro_required" }, { status: 403 });
  const today = new Date().toISOString().slice(0, 10);
  const isHost = promo.host_user_id === user.id;
  if (!isHost && promo.apply_by < today) return NextResponse.json({ error: "Applications for this promo have closed." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; priceNote?: string };
  const { data: project } = await admin.from("projects").select("id, title, slug, buy_links").eq("id", String(body.projectId || "")).eq("user_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Pick one of your books." }, { status: 400 });
  const card = (await bookCards(admin, [project.id])).get(project.id);
  if (!project.slug || !card?.url?.includes(`/${project.slug}`)) {
    return NextResponse.json({ error: "Make the book's launch page public first (Publish tab), so promo readers have somewhere to go." }, { status: 400 });
  }
  const { count } = await admin.from("group_promo_books").select("project_id", { count: "exact", head: true }).eq("promo_id", id).eq("status", "approved");
  if ((count || 0) >= promo.max_books) return NextResponse.json({ error: "This promo is full." }, { status: 400 });

  const { error } = await admin.from("group_promo_books").upsert({
    promo_id: id,
    project_id: project.id,
    user_id: user.id,
    status: isHost ? "approved" : "applied",
    price_note: String(body.priceNote || "").slice(0, 60),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (isHost) {
    await addToCalendar(admin, {
      userId: user.id,
      postOn: promo.starts_on,
      network: "any",
      note: `Share your group promo: ${promo.title}`,
      body: `${promo.title}\n${await shareLink(admin, user.id, promo.slug)}`,
      planKey: `promo:${promo.id}`,
    });
  } else {
    await notifyAuthor(admin, promo.host_user_id, {
      title: `${card.authorName} wants to join ${promo.title}`,
      body: `${project.title} applied to your group promo. Approve or decline it from Cross-promotion.`,
      href: "/dashboard/cross-promo",
    });
  }
  return NextResponse.json({ ok: true });
}

/** Host: approve or decline a book, or cancel the promo. */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const { user, admin, promo } = await load(id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!promo || promo.host_user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; projectId?: string };

  if (body.action === "cancel") {
    await admin.from("group_promos").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id);
    const { data: rows } = await admin.from("group_promo_books").select("user_id").eq("promo_id", id).in("status", ["applied", "approved"]);
    await removeFromCalendar(admin, `promo:${id}`);
    for (const uid of new Set((rows || []).map((r) => r.user_id as string))) {
      if (uid !== user.id) await notifyAuthor(admin, uid, { title: `${promo.title} was cancelled`, body: "The host cancelled this group promo. It's off your calendar.", href: "/dashboard/cross-promo" });
    }
    return NextResponse.json({ ok: true });
  }

  const { data: row } = await admin.from("group_promo_books").select("user_id, status").eq("promo_id", id).eq("project_id", String(body.projectId || "")).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (body.action === "approve") {
    const { count } = await admin.from("group_promo_books").select("project_id", { count: "exact", head: true }).eq("promo_id", id).eq("status", "approved");
    if ((count || 0) >= promo.max_books) return NextResponse.json({ error: "The promo is full. Raise the limit or decline a book first." }, { status: 400 });
    await admin.from("group_promo_books").update({ status: "approved" }).eq("promo_id", id).eq("project_id", body.projectId);
    await addToCalendar(admin, {
      userId: row.user_id,
      postOn: promo.starts_on,
      network: "any",
      note: `Share your group promo: ${promo.title}`,
      body: `${promo.title}\n${await shareLink(admin, row.user_id, promo.slug)}`,
      planKey: `promo:${promo.id}`,
    });
    await notifyAuthor(admin, row.user_id, {
      title: `You're in ${promo.title}`,
      body: `Your book is in the group promo from ${promo.starts_on} to ${promo.ends_on}. Your share day and link are on your marketing calendar.`,
      href: "/dashboard/cross-promo",
    });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "decline") {
    await admin.from("group_promo_books").update({ status: "declined" }).eq("promo_id", id).eq("project_id", body.projectId);
    const { count } = await admin.from("group_promo_books").select("project_id", { count: "exact", head: true }).eq("promo_id", id).eq("user_id", row.user_id).eq("status", "approved");
    if (!count) await admin.from("marketing_posts").delete().eq("user_id", row.user_id).eq("plan_key", `promo:${id}`).eq("status", "planned");
    await notifyAuthor(admin, row.user_id, { title: `Not this time: ${promo.title}`, body: "The host didn't include your book in this promo. There are others on the board.", href: "/dashboard/cross-promo" });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** Take your book out of a promo. */
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const { user, admin, promo } = await load(id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!promo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const projectId = new URL(req.url).searchParams.get("projectId") || "";
  await admin.from("group_promo_books").update({ status: "withdrawn" }).eq("promo_id", id).eq("project_id", projectId).eq("user_id", user.id);
  const { count } = await admin.from("group_promo_books").select("project_id", { count: "exact", head: true }).eq("promo_id", id).eq("user_id", user.id).eq("status", "approved");
  if (!count) await admin.from("marketing_posts").delete().eq("user_id", user.id).eq("plan_key", `promo:${id}`).eq("status", "planned");
  return NextResponse.json({ ok: true });
}

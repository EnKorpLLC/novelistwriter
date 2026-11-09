import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { CROSS_PROMO_MIGRATION_HINT, isMissingTable, notifyAuthor, promoPath } from "@/lib/cross-promo";

/** Every group promo, newest first, so a page can be hidden if it breaks the rules. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { data: promos, error } = await admin.from("group_promos").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? CROSS_PROMO_MIGRATION_HINT : error.message }, { status: 500 });
  const ids = (promos || []).map((p) => p.id as string);
  const [{ data: books }, { data: hosts }] = await Promise.all([
    ids.length ? admin.from("group_promo_books").select("promo_id, status").in("promo_id", ids) : Promise.resolve({ data: [] as { promo_id: string; status: string }[] }),
    admin.from("profiles").select("id, display_name, email").in("id", [...new Set((promos || []).map((p) => p.host_user_id as string))]),
  ]);
  const hostById = new Map((hosts || []).map((h) => [h.id as string, h]));
  return NextResponse.json({
    promos: (promos || []).map((p) => ({
      id: p.id,
      title: p.title,
      genre: p.genre,
      description: p.description,
      startsOn: p.starts_on,
      endsOn: p.ends_on,
      status: p.status,
      path: promoPath(p.slug),
      hostName: hostById.get(p.host_user_id)?.display_name || "Author",
      hostEmail: hostById.get(p.host_user_id)?.email || null,
      books: (books || []).filter((b) => b.promo_id === p.id && b.status === "approved").length,
      createdAt: p.created_at,
    })),
  });
}

/** Hide a promo page (it stops showing to readers and taking books) or put it back. */
export async function PATCH(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const body = (await req.json().catch(() => ({}))) as { id?: string; hidden?: boolean };
  const { data: promo } = await admin.from("group_promos").select("id, title, status, host_user_id").eq("id", String(body.id || "")).maybeSingle();
  if (!promo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (promo.status === "cancelled") return NextResponse.json({ error: "The host already cancelled this promo." }, { status: 400 });
  const status = body.hidden ? "hidden" : "open";
  await admin.from("group_promos").update({ status, updated_at: new Date().toISOString() }).eq("id", promo.id);
  await notifyAuthor(admin, promo.host_user_id, {
    title: body.hidden ? `${promo.title} was hidden` : `${promo.title} is visible again`,
    body: body.hidden
      ? "Novelist Writer hid this promo page while we take a look. Readers can't see it right now. If you think this is a mistake, reply through the contact page."
      : "Your promo page is back up for readers.",
    href: "/dashboard/cross-promo",
  });
  return NextResponse.json({ ok: true, status });
}

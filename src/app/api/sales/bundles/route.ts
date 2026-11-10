import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SALES_MIGRATION_HINT, listBundles, sellerTier } from "@/lib/direct-sales";
import { MIN_PRICE_CENTS, currentPrice, normalizeDirectSale } from "@/lib/direct-sale-rules";

async function seller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createServiceClient();
  return { user, admin, tier: await sellerTier(admin, user.id) };
}

/** The author's bundles, plus their books (with current prices) to build new ones from. */
export async function GET() {
  const s = await seller();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [bundles, { data: books }] = await Promise.all([
    listBundles(s.admin, s.user.id),
    s.admin.from("projects").select("id, title, published, direct_sale").eq("user_id", s.user.id).order("updated_at", { ascending: false }),
  ]);
  if (!bundles) return NextResponse.json({ migrationNeeded: true, error: SALES_MIGRATION_HINT, bundles: [], books: [] });
  return NextResponse.json({
    bundles,
    books: (books || []).map((b) => ({ id: b.id, title: b.title || "Untitled", published: Boolean(b.published), priceCents: currentPrice(normalizeDirectSale(b.direct_sale)).cents })),
  });
}

/** Create: { title, projectIds (2 to 10), priceCents } */
export async function POST(req: Request) {
  const s = await seller();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!s.tier) return NextResponse.json({ error: "Bundles are part of Pro and Studio." }, { status: 402 });
  const b = (await req.json().catch(() => ({}))) as { title?: string; projectIds?: string[]; priceCents?: number };
  const title = String(b.title || "").trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: "Name the bundle, like “The Ember Trilogy”." }, { status: 400 });
  const ids = [...new Set((b.projectIds || []).map(String))].slice(0, 10);
  const { data: own } = ids.length ? await s.admin.from("projects").select("id").eq("user_id", s.user.id).in("id", ids) : { data: [] };
  if ((own || []).length < 2) return NextResponse.json({ error: "Pick at least two of your books." }, { status: 400 });
  const price = Math.round(Number(b.priceCents));
  if (!(price >= MIN_PRICE_CENTS && price <= 99999)) return NextResponse.json({ error: "Set a price of at least $0.99." }, { status: 400 });
  const { count } = await s.admin.from("book_bundles").select("id", { count: "exact", head: true }).eq("author_user_id", s.user.id);
  if ((count || 0) >= 30) return NextResponse.json({ error: "You can have up to 30 bundles." }, { status: 400 });
  // Keep the order the author picked (series order)
  const keep = new Set((own || []).map((p) => p.id));
  const { error } = await s.admin.from("book_bundles").insert({ author_user_id: s.user.id, title, project_ids: ids.filter((id) => keep.has(id)), price_cents: price });
  if (error) return NextResponse.json({ error: SALES_MIGRATION_HINT }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** { id, active?, priceCents? } */
export async function PATCH(req: Request) {
  const s = await seller();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; active?: boolean; priceCents?: number };
  const patch: Record<string, unknown> = {};
  if (typeof b.active === "boolean") patch.active = b.active;
  if (Number(b.priceCents) >= MIN_PRICE_CENTS) patch.price_cents = Math.round(Number(b.priceCents));
  await s.admin.from("book_bundles").update(patch).eq("id", String(b.id || "")).eq("author_user_id", s.user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await seller();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string };
  await s.admin.from("book_bundles").delete().eq("id", String(b.id || "")).eq("author_user_id", s.user.id);
  return NextResponse.json({ ok: true });
}

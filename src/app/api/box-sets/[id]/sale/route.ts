import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { PREORDER_MIGRATION_HINT, SALES_MIGRATION_HINT, bundleReadiness, sellerStatus } from "@/lib/direct-sales";
import { MIN_PRICE_CENTS, currentPrice, normalizeDirectSale } from "@/lib/direct-sale-rules";

async function load(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createServiceClient();
  const { data: set } = await admin.from("box_sets").select("id, user_id, title, project_ids").eq("id", id).eq("user_id", user.id).maybeSingle();
  return set ? { user, admin, set } : null;
}

/** Selling this box set as one ebook: its price, whether it's on sale, and what's in the way. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await load(id);
  if (!l) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: row, error } = await l.admin.from("book_bundles").select("id, price_cents, active").eq("box_set_id", id).maybeSingle();
  if (error) return NextResponse.json({ migrationNeeded: true, error: PREORDER_MIGRATION_HINT });
  const ids = (l.set.project_ids || []) as string[];
  const { data: books } = ids.length ? await l.admin.from("projects").select("id, published, direct_sale").in("id", ids) : { data: [] };
  const regularCents = (books || []).reduce((n, b) => n + currentPrice(normalizeDirectSale(b.direct_sale)).cents, 0);
  const status = await sellerStatus(l.admin, l.user.id);
  let reason: string | null = null;
  if ("migrationNeeded" in status) reason = SALES_MIGRATION_HINT;
  else if (status.tier !== "studio") reason = "Selling a box set as one ebook is part of Studio.";
  else if (!status.termsAccepted || !status.payoutsEnabled) reason = "Set up selling first: open any book's Sell tab to accept the seller terms and connect payouts.";
  else if (ids.length < 2) reason = "Add at least two books.";
  else if ((books || []).some((b) => !b.published)) reason = "Every book in the set has to be out.";
  const ready = row?.active && !reason ? await bundleReadiness(l.admin, row.id) : null;
  return NextResponse.json({
    sale: row ? { priceCents: row.price_cents as number, active: Boolean(row.active) } : null,
    regularCents,
    live: Boolean(ready?.ok),
    reason: row?.active ? reason || (ready && !ready.ok ? ready.reason : null) : reason,
  });
}

/** { priceCents, active } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await load(id);
  if (!l) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const status = await sellerStatus(l.admin, l.user.id);
  if ("migrationNeeded" in status || status.tier !== "studio") return NextResponse.json({ error: "Selling a box set as one ebook is part of Studio." }, { status: 402 });
  const b = (await req.json().catch(() => ({}))) as { priceCents?: number; active?: boolean };
  const price = Math.round(Number(b.priceCents));
  if (!(price >= MIN_PRICE_CENTS && price <= 99999)) return NextResponse.json({ error: "Set a price of at least $0.99." }, { status: 400 });
  const ids = ((l.set.project_ids || []) as string[]).slice(0, 12);
  if (ids.length < 2) return NextResponse.json({ error: "Add at least two books to the box set first." }, { status: 400 });
  const { data: row, error } = await l.admin.from("book_bundles").select("id").eq("box_set_id", id).maybeSingle();
  if (error) return NextResponse.json({ error: PREORDER_MIGRATION_HINT }, { status: 500 });
  const values = { title: l.set.title || "Box set", project_ids: ids, price_cents: price, active: b.active !== false };
  const { error: saveError } = row
    ? await l.admin.from("book_bundles").update(values).eq("id", row.id)
    : await l.admin.from("book_bundles").insert({ ...values, author_user_id: l.user.id, box_set_id: id });
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

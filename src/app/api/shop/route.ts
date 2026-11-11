import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { deleteObject, objectSize, r2Configured, signedUploadUrl } from "@/lib/r2";
import { newCode } from "@/lib/marketplace";
import { sellerStatus } from "@/lib/direct-sales";
import { SHOP_HINT, itemFromRow, normalizeIncludes, shopSettings } from "@/lib/shop";
import { ITEM_KINDS, hasIncludes } from "@/lib/shop-rules";

const PACKAGES_HINT = "Packages, numbered editions, and pre-orders need a database update. Run supabase/migration_shop_packages.sql in the Supabase SQL editor.";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The author's shop: items, shipping settings, books to tie items to, and whether selling is set up. */
export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const settings = await shopSettings(admin, user.id);
  if (!settings) return NextResponse.json({ migrationNeeded: true, error: SHOP_HINT });
  const [{ data: rows }, { data: books }, status, { data: extras }] = await Promise.all([
    admin.from("shop_items").select("*").eq("author_user_id", user.id).order("sort").order("created_at"),
    admin.from("projects").select("id, title").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100),
    sellerStatus(admin, user.id),
    admin.from("book_extras").select("id, title, project_id").eq("author_user_id", user.id).limit(100),
  ]);
  return NextResponse.json({
    extras: (extras || []).map((e) => ({ id: e.id as string, title: e.title as string, projectId: e.project_id as string })),
    items: await Promise.all((rows || []).map(itemFromRow)),
    settings,
    books: (books || []).map((b) => ({ id: b.id as string, title: (b.title as string) || "Untitled" })),
    seller: "migrationNeeded" in status ? null : status,
    storageReady: r2Configured(),
  });
}

const cents = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/**
 *   { action: "settings", shipFirstCents, shipEachCents, handlingDays, reopen? }
 *   { action: "save_item", id?, kind, projectId, title, description, priceCents, stock, personalize, active, rights }
 *   { action: "delete_item", id }   (turned off instead if it has orders)
 *   { action: "photo_url", id, name } → { url, key }   then   { action: "photo_uploaded", id, key }
 */
export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (b.action === "settings") {
    const first = cents(b.shipFirstCents, 0, 10000);
    const each = cents(b.shipEachCents, 0, 10000);
    const days = cents(b.handlingDays, 1, 10);
    if (first == null || each == null || days == null) return NextResponse.json({ error: "Shipping runs $0 to $100, and handling 1 to 10 business days." }, { status: 400 });
    const { error } = await admin
      .from("shop_settings")
      .upsert({ author_user_id: user.id, ship_first_cents: first, ship_each_cents: each, handling_days: days, ...(b.reopen ? { paused_at: null, paused_reason: null } : {}), updated_at: now }, { onConflict: "author_user_id" });
    if (error) return NextResponse.json({ error: SHOP_HINT }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "save_item") {
    const status = await sellerStatus(admin, user.id);
    if ("migrationNeeded" in status || !status.tier) return NextResponse.json({ error: "The shop is part of Pro and Studio." }, { status: 402 });
    const title = String(b.title || "").trim().slice(0, 120);
    if (!title) return NextResponse.json({ error: "Name it, like “Signed paperback of The Ember Coast”." }, { status: 400 });
    const price = cents(b.priceCents, 100, 99999);
    if (price == null) return NextResponse.json({ error: "Set a price of at least $1.00." }, { status: 400 });
    const stock = cents(b.stock, 0, 100000);
    if (stock == null) return NextResponse.json({ error: "Enter how many you have." }, { status: 400 });
    const kind = ITEM_KINDS.some((k) => k.id === b.kind) ? String(b.kind) : "other";
    if (kind !== "signed_book" && b.rights !== true && !b.id) return NextResponse.json({ error: "Confirm you made this art or have the right to sell it." }, { status: 400 });
    let projectId: string | null = null;
    if (b.projectId) {
      const { data: p } = await admin.from("projects").select("id").eq("id", String(b.projectId)).eq("user_id", user.id).maybeSingle();
      projectId = (p?.id as string | null) || null;
    }
    // A numbered edition's stock is always the numbers still unsold, so it's set once, from the edition size
    const existing = b.id ? (await admin.from("shop_items").select("*").eq("id", String(b.id)).eq("author_user_id", user.id).maybeSingle()).data : null;
    const limited = existing?.limited_total ?? (b.limitedTotal ? cents(b.limitedTotal, 1, 100000) : null);
    if (b.limitedTotal && limited == null) return NextResponse.json({ error: "A numbered edition is 1 to 100,000 copies." }, { status: 400 });
    const shipsOn = typeof b.shipsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.shipsOn) ? b.shipsOn : null;
    if (shipsOn && shipsOn <= now.slice(0, 10) && shipsOn !== existing?.ships_on) return NextResponse.json({ error: "A pre-order's ship date needs to be in the future." }, { status: 400 });
    const row = {
      author_user_id: user.id,
      project_id: projectId,
      kind,
      title,
      description: String(b.description || "").trim().slice(0, 600),
      price_cents: price,
      stock: existing?.limited_total ? existing.stock : limited ?? stock,
      personalize: b.personalize === true,
      active: b.active !== false,
      includes: kind === "package" ? await normalizeIncludes(admin, user.id, b.includes) : {},
      limited_total: limited,
      ships_on: shipsOn,
      ...(b.rights === true ? { rights_confirmed_at: now } : {}),
    };
    if (kind === "package" && !hasIncludes(row.includes)) return NextResponse.json({ error: "A package includes at least one digital copy or extra. Pick what comes with it." }, { status: 400 });
    const { error } = b.id
      ? await admin.from("shop_items").update(row).eq("id", String(b.id)).eq("author_user_id", user.id)
      : await admin.from("shop_items").insert(row);
    if (error) return NextResponse.json({ error: /includes|limited_total|ships_on|kind/.test(error.message) ? PACKAGES_HINT : SHOP_HINT }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "delete_item") {
    const id = String(b.id || "");
    const { data: sold } = await admin.from("book_purchases").select("id").eq("item_id", id).limit(1);
    if (sold?.length) {
      await admin.from("shop_items").update({ active: false }).eq("id", id).eq("author_user_id", user.id);
      return NextResponse.json({ ok: true, note: "It has orders, so it's turned off instead of deleted." });
    }
    const { data: it } = await admin.from("shop_items").select("photo_key").eq("id", id).eq("author_user_id", user.id).maybeSingle();
    if (it?.photo_key) await deleteObject(it.photo_key as string).catch(() => null);
    await admin.from("shop_items").delete().eq("id", id).eq("author_user_id", user.id);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "photo_url" || b.action === "photo_uploaded") {
    if (!r2Configured()) return NextResponse.json({ error: "File storage isn't set up yet." }, { status: 503 });
    const { data: it } = await admin.from("shop_items").select("id, photo_key").eq("id", String(b.id || "")).eq("author_user_id", user.id).maybeSingle();
    if (!it) return NextResponse.json({ error: "Save the item first." }, { status: 404 });
    if (b.action === "photo_url") {
      const name = String(b.name || "").replace(/[^\w.\- ]+/g, "").slice(0, 60);
      if (!/\.(jpe?g|png|webp)$/i.test(name)) return NextResponse.json({ error: "A JPG, PNG, or WebP photo." }, { status: 400 });
      const key = `shop/${user.id}/${it.id}-${newCode()}-${name}`;
      return NextResponse.json({ key, url: await signedUploadUrl(key, 900) });
    }
    const key = String(b.key || "");
    if (!key.startsWith(`shop/${user.id}/${it.id}-`)) return NextResponse.json({ error: "Upload not found." }, { status: 400 });
    const bytes = await objectSize(key).catch(() => null);
    if (bytes == null || bytes > 10 * 1024 * 1024) {
      await deleteObject(key).catch(() => null);
      return NextResponse.json({ error: "Photos can be up to 10 MB." }, { status: 400 });
    }
    if (it.photo_key) await deleteObject(it.photo_key as string).catch(() => null);
    await admin.from("shop_items").update({ photo_key: key }).eq("id", it.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

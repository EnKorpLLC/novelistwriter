import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { deleteObject, objectSize, r2Configured, signedUploadUrl } from "@/lib/r2";
import { sellerTier } from "@/lib/direct-sales";
import { EXTRAS_HINT, extraHasOwners, extraKey, getExtra, listExtras } from "@/lib/digital-extras";
import { EXTRAS_PER_BOOK, EXTRA_MAX_BYTES, EXTRA_MAX_FILES, MAX_PRICE_CENTS, MIN_PRICE_CENTS, extraFileType } from "@/lib/direct-sale-rules";

async function ownerProject(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("projects").select("id, user_id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return data ? { user, project: data } : null;
}

/** Price in cents, null when it isn't sold on its own, or undefined when the value is out of range. */
function priceOf(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= MIN_PRICE_CENTS && n <= MAX_PRICE_CENTS ? n : undefined;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownerProject(id);
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const extras = await listExtras(createServiceClient(), id);
  if (!extras) return NextResponse.json({ migrationNeeded: true, error: EXTRAS_HINT, extras: [] });
  return NextResponse.json({ extras, storageReady: r2Configured() });
}

/**
 *   { action: "create", title, description, kind, priceCents | null, withEbook, rights: true }
 *   { action: "update", extraId, ...same fields, active }
 *   { action: "delete", extraId }   (turned off instead if anyone already has it)
 *   { action: "upload_url", extraId, name } → { url }   then   { action: "uploaded", extraId, name }
 *   { action: "remove_file", extraId, name }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownerProject(id);
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (b.action === "create") {
    if (!(await sellerTier(admin, own.user.id))) return NextResponse.json({ error: "Selling extras is part of Pro and Studio." }, { status: 402 });
    if (b.rights !== true) return NextResponse.json({ error: "Confirm you made this or have the right to sell it." }, { status: 400 });
    const title = String(b.title || "").trim().slice(0, 120);
    if (!title) return NextResponse.json({ error: "Name it, like “Map of the Ember Coast”." }, { status: 400 });
    const price = priceOf(b.priceCents);
    if (price === undefined) return NextResponse.json({ error: "Set a price from $0.99 to $99.99, or leave it blank." }, { status: 400 });
    if (price == null && b.withEbook !== true) return NextResponse.json({ error: "Set a price, or include it free with the ebook (or both)." }, { status: 400 });
    const { count, error: countError } = await admin.from("book_extras").select("id", { count: "exact", head: true }).eq("project_id", id);
    if (countError) return NextResponse.json({ error: EXTRAS_HINT }, { status: 500 });
    if ((count || 0) >= EXTRAS_PER_BOOK) return NextResponse.json({ error: `A book can have up to ${EXTRAS_PER_BOOK} extras.` }, { status: 400 });
    const { data, error } = await admin
      .from("book_extras")
      .insert({
        project_id: id,
        author_user_id: own.user.id,
        title,
        description: String(b.description || "").trim().slice(0, 600),
        kind: b.kind === "writing" ? "writing" : "art",
        price_cents: price,
        with_ebook: b.withEbook === true,
        rights_confirmed_at: new Date().toISOString(),
        sort: count || 0,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: EXTRAS_HINT }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  const extra = await getExtra(admin, String(b.extraId || ""));
  if (!extra || extra.projectId !== id) return NextResponse.json({ error: "Extra not found" }, { status: 404 });

  if (b.action === "update") {
    const patch: Record<string, unknown> = {};
    if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim().slice(0, 120);
    if (typeof b.description === "string") patch.description = b.description.trim().slice(0, 600);
    if (b.kind === "art" || b.kind === "writing") patch.kind = b.kind;
    if ("priceCents" in b) {
      const price = priceOf(b.priceCents);
      if (price === undefined) return NextResponse.json({ error: "Set a price from $0.99 to $99.99, or leave it blank." }, { status: 400 });
      patch.price_cents = price;
    }
    if (typeof b.withEbook === "boolean") patch.with_ebook = b.withEbook;
    if (typeof b.active === "boolean") patch.active = b.active;
    const priceAfter = "price_cents" in patch ? patch.price_cents : extra.priceCents;
    const withAfter = "with_ebook" in patch ? patch.with_ebook : extra.withEbook;
    if (priceAfter == null && !withAfter) return NextResponse.json({ error: "Set a price, or include it free with the ebook (or both)." }, { status: 400 });
    await admin.from("book_extras").update(patch).eq("id", extra.id);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "delete") {
    if (await extraHasOwners(admin, extra)) {
      await admin.from("book_extras").update({ active: false }).eq("id", extra.id);
      return NextResponse.json({ ok: true, turnedOff: true, note: "Readers already have this one, so it's turned off instead: no new sales, and they keep their downloads." });
    }
    for (const f of extra.files) await deleteObject(f.key).catch(() => null);
    await admin.from("book_extras").delete().eq("id", extra.id);
    return NextResponse.json({ ok: true });
  }

  if (!r2Configured()) return NextResponse.json({ error: "File storage isn't set up yet." }, { status: 503 });
  const name = String(b.name || "").replace(/[\\/:*?"<>|#%]+/g, "").trim().slice(0, 120);

  if (b.action === "upload_url") {
    if (!extraFileType(name)) return NextResponse.json({ error: "Images (JPG, PNG, WebP, GIF), PDF, EPUB, MP3, or ZIP files only." }, { status: 400 });
    if (extra.files.length >= EXTRA_MAX_FILES && !extra.files.some((f) => f.name === name)) {
      return NextResponse.json({ error: `Up to ${EXTRA_MAX_FILES} files per extra. Zip them together if you have more.` }, { status: 400 });
    }
    return NextResponse.json({ url: await signedUploadUrl(extraKey(id, extra.id, name), 3600), contentType: extraFileType(name) });
  }
  if (b.action === "uploaded") {
    const key = extraKey(id, extra.id, name);
    const bytes = await objectSize(key).catch(() => null);
    if (bytes == null) return NextResponse.json({ error: `${name} didn't arrive. Try again.` }, { status: 400 });
    if (bytes > EXTRA_MAX_BYTES) {
      await deleteObject(key).catch(() => null);
      return NextResponse.json({ error: `${name} is over ${EXTRA_MAX_BYTES / 1024 / 1024} MB.` }, { status: 400 });
    }
    const files = [...extra.files.filter((f) => f.name !== name), { name, key, bytes }];
    await admin.from("book_extras").update({ files }).eq("id", extra.id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "remove_file") {
    const file = extra.files.find((f) => f.name === name);
    if (!file) return NextResponse.json({ ok: true });
    await deleteObject(file.key).catch(() => null);
    await admin.from("book_extras").update({ files: extra.files.filter((f) => f.name !== name) }).eq("id", extra.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

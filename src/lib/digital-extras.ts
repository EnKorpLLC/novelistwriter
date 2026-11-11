import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sellerStatus } from "@/lib/direct-sales";
import type { BookExtra, ExtraFile, ExtraKind } from "@/lib/direct-sale-rules";

/**
 * Digital extras: character art, maps, and bonus writing an author sells on its own, gives free with the ebook
 * bought here, or both. Files live in R2 and are downloaded through short-lived signed links.
 */

export const EXTRAS_HINT = "Extras need a database update. Run supabase/migration_preorders_extras.sql in the Supabase SQL editor.";

/** Stripe's categories: downloaded images to keep, and bonus writing taxed like the ebook. */
export const EXTRA_TAX_CODES: Record<ExtraKind, string> = {
  art: process.env.STRIPE_IMAGE_TAX_CODE || "txcd_10501000",
  writing: process.env.STRIPE_EBOOK_TAX_CODE || "txcd_10302000",
};

export const extraKey = (projectId: string, extraId: string, fileName: string) => `extras/${projectId}/${extraId}/${fileName}`;

type ExtraRow = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  kind: string;
  price_cents: number | null;
  with_ebook: boolean;
  files: unknown;
  active: boolean;
};

export function extraFromRow(r: ExtraRow): BookExtra {
  const files = Array.isArray(r.files) ? (r.files as ExtraFile[]).filter((f) => f && typeof f.name === "string" && typeof f.key === "string") : [];
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description || "",
    kind: r.kind === "writing" ? "writing" : "art",
    priceCents: r.price_cents ?? null,
    withEbook: Boolean(r.with_ebook),
    files,
    active: Boolean(r.active),
  };
}

/** This book's extras (null before the migration). */
export async function listExtras(admin: SupabaseClient, projectId: string): Promise<BookExtra[] | null> {
  const { data, error } = await admin.from("book_extras").select("*").eq("project_id", projectId).order("sort").order("created_at");
  return error ? null : (data || []).map((r) => extraFromRow(r as ExtraRow));
}

export async function getExtra(admin: SupabaseClient, extraId: string): Promise<(BookExtra & { authorId: string }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(extraId)) return null;
  const { data, error } = await admin.from("book_extras").select("*").eq("id", extraId).maybeSingle();
  return error || !data ? null : { ...extraFromRow(data as ExtraRow), authorId: data.author_user_id as string };
}

/** Can this extra be bought on its own right now? It doesn't wait for the book: art can sell before release. */
export async function extraReadiness(admin: SupabaseClient, extraId: string) {
  const extra = await getExtra(admin, extraId);
  if (!extra?.active || extra.priceCents == null || !extra.files.length) return { ok: false as const, reason: "This extra isn't for sale." };
  const status = await sellerStatus(admin, extra.authorId);
  if ("migrationNeeded" in status || !status.tier || !status.termsAccepted || !status.payoutsEnabled) return { ok: false as const, reason: "This extra isn't for sale right now." };
  return { ok: true as const, extra, tier: status.tier };
}

type PurchaseLike = {
  status: string;
  price_cents?: number;
  format?: string | null;
  extra_id?: string | null;
  project_id: string | null;
  box_set_id?: string | null;
  preorder_release?: string | null;
  delivered_at?: string | null;
};

/**
 * Does this purchase unlock this extra? Bought on its own, or free with the ebook once the ebook is the reader's.
 * Turning an extra off stops new sales; readers who have it keep it. Free reader-magnet copies don't include extras.
 */
export function purchaseUnlocks(p: PurchaseLike, extra: BookExtra) {
  if (p.status !== "paid") return false;
  if (p.format === "extra") return p.extra_id === extra.id;
  if ((p.format || "ebook") !== "ebook" || p.box_set_id || p.project_id !== extra.projectId || p.price_cents === 0) return false;
  if (p.preorder_release && !p.delivered_at) return false;
  return extra.withEbook;
}

/** The extras a purchase page lists: the one bought, or the ones that come free with this ebook. */
export async function extrasForPurchase(admin: SupabaseClient, p: PurchaseLike): Promise<BookExtra[]> {
  if (p.status !== "paid" || !p.project_id) return [];
  if (p.format === "extra") {
    const e = p.extra_id ? await getExtra(admin, p.extra_id) : null;
    return e && e.files.length ? [e] : [];
  }
  const all = (await listExtras(admin, p.project_id)) || [];
  return all.filter((e) => e.files.length && purchaseUnlocks(p, e));
}

/** Has anyone paid for, or been given, this extra? Then it can be turned off but not deleted. */
export async function extraHasOwners(admin: SupabaseClient, extra: BookExtra) {
  const { data: bought } = await admin.from("book_purchases").select("id").eq("extra_id", extra.id).eq("status", "paid").limit(1);
  if (bought?.length) return true;
  if (!extra.withEbook) return false;
  const { data: ebooks } = await admin.from("book_purchases").select("id").eq("project_id", extra.projectId).eq("format", "ebook").eq("status", "paid").gt("price_cents", 0).limit(1);
  return Boolean(ebooks?.length);
}

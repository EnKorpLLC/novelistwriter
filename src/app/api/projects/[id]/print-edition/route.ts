import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { deleteObject, objectSize, r2Configured, signedDownloadUrl, signedUploadUrl } from "@/lib/r2";
import { normalizeFormat } from "@/lib/book/format";
import { sellerTier } from "@/lib/direct-sales";
import { coverDimensions, luluConfigured, luluSandbox, startCheck } from "@/lib/lulu";
import { PRINT_HINT, editionFor, paperbackReadiness, podOf, printKey, refreshChecks, refreshPrintCost, type EditionRow } from "@/lib/print-sales";
import { LULU_TRIMS, MAX_PAGES, MIN_PAGES, MIN_PRINT_PRICE_CENTS } from "@/lib/print-rules";

const MAX_PDF_BYTES = 650 * 1024 * 1024;

async function owner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("projects").select("id, user_id, title, published, format_settings").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return data;
}

/** The paperback edition with its checks brought up to date, the cover size Lulu needs, the printing cost, and what's left before it can sell. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await owner(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  let e = await editionFor(admin, id);
  if (e === undefined) return NextResponse.json({ migrationNeeded: true, error: PRINT_HINT });
  const format = normalizeFormat(project.format_settings);
  if (e) e = await refreshChecks(admin, e);
  const pod = e ? podOf(e) : null;
  const printCost = e && pod && !e.print_cost_cents && e.page_count >= MIN_PAGES ? await refreshPrintCost(admin, e) : (e?.print_cost_cents ?? null);
  const cover = e && pod && e.page_count >= MIN_PAGES && luluConfigured() ? await coverDimensions(pod, e.page_count).catch(() => null) : null;
  const ready = await paperbackReadiness(admin, project);
  return NextResponse.json({
    connected: luluConfigured(),
    sandbox: luluSandbox(),
    storageReady: r2Configured(),
    tier: await sellerTier(admin, project.user_id),
    edition: e
      ? {
          trim: e.trim,
          paper: e.paper,
          finish: e.finish,
          pageCount: e.page_count,
          interiorStatus: e.interior_status,
          coverStatus: e.cover_status,
          fileErrors: Array.isArray(e.file_errors) ? e.file_errors : [],
          printCostCents: printCost,
          proofOk: Boolean(e.proof_ok_at),
          priceCents: e.price_cents,
          saleOn: e.sale_on,
          freeEbook: e.free_ebook,
          hasInterior: Boolean(e.interior_key),
          hasCover: Boolean(e.cover_key),
        }
      : null,
    // Start from the print layout's settings when Lulu prints that size
    defaults: { trim: LULU_TRIMS[format.trim] ? format.trim : "6x9", paper: format.paper, pageCount: format.lastPageCount || 0 },
    coverSize: cover,
    live: ready.ok,
    reason: ready.ok ? null : ready.reason,
  });
}

/**
 *   { action: "settings", trim, paper, finish, pageCount, priceCents, freeEbook }   (a new size, paper, or length needs new files and a new proof)
 *   { action: "upload_url", kind: "interior" | "cover" } → { url, key }   then   { action: "uploaded", kind, key }
 *   { action: "proof_ok" } · { action: "sale", on }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await owner(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const existing = await editionFor(admin, id);
  if (existing === undefined) return NextResponse.json({ error: PRINT_HINT }, { status: 500 });
  const now = new Date().toISOString();

  if (b.action === "settings") {
    const trim = String(b.trim || existing?.trim || "6x9");
    if (!LULU_TRIMS[trim as keyof typeof LULU_TRIMS]) return NextResponse.json({ error: "Lulu prints 5×8, 5.5×8.5, and 6×9 paperbacks." }, { status: 400 });
    const paper = b.paper === "white" ? "white" : "cream";
    const finish = b.finish === "gloss" ? "gloss" : "matte";
    const pages = Math.round(Number(b.pageCount) || existing?.page_count || 0);
    if (pages && (pages < MIN_PAGES || pages > MAX_PAGES)) return NextResponse.json({ error: `Lulu paperbacks run ${MIN_PAGES} to ${MAX_PAGES} pages.` }, { status: 400 });
    const price = Math.round(Number(b.priceCents) || existing?.price_cents || 1699);
    if (price < MIN_PRINT_PRICE_CENTS) return NextResponse.json({ error: "Set a price of at least $4.99." }, { status: 400 });
    const changed = existing && (existing.trim !== trim || existing.paper !== paper || existing.finish !== finish || existing.page_count !== pages);
    const row: Partial<EditionRow> & { updated_at: string } = {
      project_id: id,
      author_user_id: project.user_id,
      trim,
      paper,
      finish,
      page_count: pages,
      price_cents: price,
      free_ebook: b.freeEbook !== false,
      updated_at: now,
      // The files and proof were for the old size or length
      ...(changed ? { interior_status: "none", cover_status: "none", interior_check_id: null, cover_check_id: null, file_errors: [], print_cost_cents: null, proof_ok_at: null, sale_on: false } : {}),
    };
    const { error } = await admin.from("print_editions").upsert(row, { onConflict: "project_id" });
    if (error) return NextResponse.json({ error: PRINT_HINT }, { status: 500 });
    if (changed && existing) {
      for (const k of [existing.interior_key, existing.cover_key]) if (k) await deleteObject(k).catch(() => null);
      await admin.from("print_editions").update({ interior_key: null, cover_key: null }).eq("project_id", id);
    }
    return NextResponse.json({ ok: true, reset: Boolean(changed) });
  }

  if (!existing) return NextResponse.json({ error: "Save the paperback's size and page count first." }, { status: 400 });

  if (b.action === "upload_url" || b.action === "uploaded") {
    const kind = b.kind === "cover" ? "cover" : "interior";
    if (!r2Configured()) return NextResponse.json({ error: "File storage isn't set up yet." }, { status: 503 });
    if (b.action === "upload_url") {
      const key = printKey(id, kind);
      return NextResponse.json({ key, url: await signedUploadUrl(key, 3600) });
    }
    const key = String(b.key || "");
    if (!key.startsWith(`print/${id}/${kind}-`)) return NextResponse.json({ error: "Upload not found." }, { status: 400 });
    const bytes = await objectSize(key).catch(() => null);
    if (bytes == null) return NextResponse.json({ error: "The file didn't arrive. Try again." }, { status: 400 });
    if (bytes > MAX_PDF_BYTES) {
      await deleteObject(key).catch(() => null);
      return NextResponse.json({ error: "That PDF is over 650 MB." }, { status: 400 });
    }
    const old = kind === "interior" ? existing.interior_key : existing.cover_key;
    if (old && old !== key) await deleteObject(old).catch(() => null);
    const pod = podOf(existing);
    let check: string | null = null;
    let status = "none";
    if (luluConfigured() && pod) {
      check = await startCheck(kind, await signedDownloadUrl(key, 24 * 3600), pod, existing.page_count).catch(() => null);
      status = check ? "checking" : "error";
    }
    await admin
      .from("print_editions")
      .update({ [`${kind}_key`]: key, [`${kind}_status`]: status, [`${kind}_check_id`]: check, file_errors: [], proof_ok_at: null, sale_on: false, updated_at: now })
      .eq("project_id", id);
    return NextResponse.json({ ok: true, checking: Boolean(check) });
  }

  if (b.action === "proof_ok") {
    if (existing.interior_status !== "ok" || existing.cover_status !== "ok") return NextResponse.json({ error: "Both files need to pass Lulu's check first." }, { status: 400 });
    const { data: proof } = await admin.from("book_purchases").select("id").eq("project_id", id).eq("is_proof", true).limit(1);
    if (!proof?.length) return NextResponse.json({ error: "Order a proof copy first." }, { status: 400 });
    await admin.from("print_editions").update({ proof_ok_at: now, updated_at: now }).eq("project_id", id);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "sale") {
    await admin.from("print_editions").update({ sale_on: b.on === true, updated_at: now }).eq("project_id", id);
    const ready = await paperbackReadiness(admin, project);
    return NextResponse.json({ ok: true, live: ready.ok, reason: ready.ok ? null : ready.reason });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

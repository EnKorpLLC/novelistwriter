import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sellerStatus, SALES_MIGRATION_HINT } from "@/lib/direct-sales";
import { copyObject, r2Configured, signedDownloadUrl } from "@/lib/r2";
import { mp3Ms, normalizeAudiobookSale, normalizeDirectSale, type AudiobookSale } from "@/lib/direct-sale-rules";
import { jobFromRow } from "@/lib/narration-access";

/**
 * Selling the audiobook direct (A5a): the same seller setup, fees, Stripe Tax, refund window, and payouts as
 * ebooks. The listening copy lives in R2 and is streamed and downloaded through short-lived signed links.
 */

export const AUDIO_SALES_HINT = "Selling audiobooks needs a database update. Run supabase/migration_audiobook_sales.sql in the Supabase SQL editor.";
const DAY_MS = 86_400_000;

export const audiobookKey = (projectId: string, fileName: string) => `audiobooks/${projectId}/${fileName}`;
/** What goes into the listening copy: chapters and credits, plus the sample (kept apart). */
export const isListeningFile = (name: string) => /\.mp3$/i.test(name);
export const isSampleFile = (name: string) => /^retail sample\.mp3$/i.test(name);
/** "002 The Storm.mp3" → "The Storm" */
export const fileTitle = (name: string) => name.replace(/\.mp3$/i, "").replace(/^\d{1,4}\s+/, "").trim() || name;

export type AudiobookFile = { id: string; sort: number; title: string; fileName: string; bytes: number; durationMs: number; isSample: boolean };

export async function audiobookFiles(admin: SupabaseClient, projectId: string): Promise<AudiobookFile[] | null> {
  const { data, error } = await admin.from("audiobook_files").select("*").eq("project_id", projectId).order("sort");
  if (error) return null;
  return (data || []).map((f) => ({ id: f.id, sort: f.sort, title: f.title, fileName: f.file_name, bytes: Number(f.bytes) || 0, durationMs: f.duration_ms, isSample: f.is_sample }));
}

/** Can the audiobook (or the ebook + audiobook set) be bought right now? Reasons are for the author. */
export async function audiobookReadiness(admin: SupabaseClient, project: { id: string; user_id: string; published?: boolean | null; audiobook_sale?: unknown; direct_sale?: unknown }) {
  const sale = normalizeAudiobookSale(project.audiobook_sale);
  const status = await sellerStatus(admin, project.user_id);
  if ("migrationNeeded" in status) return { ok: false as const, reason: SALES_MIGRATION_HINT, sale };
  if (!status.tier) return { ok: false as const, reason: "Selling direct is part of Pro and Studio.", sale };
  if (!r2Configured()) return { ok: false as const, reason: "Audio storage isn't set up on this site yet.", sale };
  const files = await audiobookFiles(admin, project.id);
  if (!files) return { ok: false as const, reason: AUDIO_SALES_HINT, sale };
  const listening = files.filter((f) => !f.isSample);
  if (!listening.length) return { ok: false as const, reason: "Upload the finished files first.", sale };
  if (!sale.on) return { ok: false as const, reason: "Selling the audiobook is turned off.", sale };
  if (!project.published) return { ok: false as const, reason: "Mark the book out now to start selling.", sale };
  if (!status.termsAccepted) return { ok: false as const, reason: "Accept the seller terms in the Sell tab.", sale };
  if (!status.payoutsEnabled) return { ok: false as const, reason: "Finish setting up payouts with Stripe in the Sell tab.", sale };
  const ebookPrice = normalizeDirectSale(project.direct_sale).priceCents;
  return {
    ok: true as const,
    tier: status.tier,
    sale,
    files: listening,
    sample: files.find((f) => f.isSample) || null,
    durationMs: listening.reduce((n, f) => n + f.durationMs, 0),
    // The set only makes sense when it's cheaper than buying both
    bundleCents: sale.bundlePriceCents != null && sale.bundlePriceCents < ebookPrice + sale.priceCents ? sale.bundlePriceCents : null,
  };
}

/** Listening links for a buyer (or the sample for anyone), good for a few hours. */
export async function signedFiles(files: AudiobookFile[], projectId: string, opts: { download?: boolean } = {}) {
  return Promise.all(
    files.map(async (f) => ({
      ...f,
      url: await signedDownloadUrl(audiobookKey(projectId, f.fileName), 6 * 3600, opts.download ? f.fileName : undefined),
    }))
  );
}

/**
 * The narrator's royalty share on this book, if their agreement is a royalty share and still running
 * (counted from when the job finished). Comes out of the author's share of each audiobook sale.
 */
export async function royaltyFor(admin: SupabaseClient, projectId: string): Promise<{ jobId: string; narratorId: string; pct: number } | null> {
  const { data } = await admin.from("narrator_jobs").select("*").eq("project_id", projectId).eq("status", "completed").order("updated_at", { ascending: false }).limit(1);
  const row = data?.[0];
  if (!row?.narrator_id) return null;
  const job = jobFromRow(row);
  if (job.terms.pay !== "royalty_share") return null;
  const started = Date.parse((row.final_paid_at as string) || (row.updated_at as string));
  if (Number.isFinite(started) && Date.now() > started + job.terms.shareYears * 365 * DAY_MS) return null;
  return { jobId: job.id, narratorId: row.narrator_id as string, pct: job.terms.sharePct };
}

/** Use a narrator's delivered files as the listening copy: copied inside storage, never re-uploaded. */
export async function adoptDeliveredFiles(admin: SupabaseClient, projectId: string) {
  const { data: job } = await admin.from("narrator_jobs").select("id").eq("project_id", projectId).eq("status", "completed").order("updated_at", { ascending: false }).limit(1);
  if (!job?.[0]) throw new Error("There's no finished narrator job on this book.");
  const { data: files } = await admin.from("narration_deliveries").select("file_name, r2_key, bytes").eq("job_id", job[0].id).is("deleted_at", null);
  const mp3s = (files || []).filter((f) => isListeningFile(f.file_name as string));
  if (!mp3s.length) throw new Error("The delivered files have expired. Upload them from your export folder instead.");
  let sort = 0;
  for (const f of mp3s.sort((a, b) => String(a.file_name).localeCompare(String(b.file_name)))) {
    const name = f.file_name as string;
    await copyObject(f.r2_key as string, audiobookKey(projectId, name));
    await admin
      .from("audiobook_files")
      .upsert(
        { project_id: projectId, sort: isSampleFile(name) ? 9999 : sort++, title: fileTitle(name), file_name: name, r2_key: audiobookKey(projectId, name), bytes: Number(f.bytes) || 0, duration_ms: mp3Ms(Number(f.bytes) || 0), is_sample: isSampleFile(name) },
        { onConflict: "project_id,file_name" }
      );
  }
  return mp3s.length;
}

export type AudiobookBadge = { hours: number; humanNarrated: boolean; recordedHere: boolean };

/**
 * Audiobook badges for books on sale: "Human narrated" is the author's statement; "Recorded in Novelist Writer"
 * is earned when the takes recorded in our studio (not imported) cover at least 90% of the finished length.
 */
export async function audiobookBadges(admin: SupabaseClient, projects: { id: string; audiobook_sale?: unknown }[]): Promise<Map<string, AudiobookBadge>> {
  const out = new Map<string, AudiobookBadge>();
  const onSale = projects.filter((p) => normalizeAudiobookSale(p.audiobook_sale).on);
  if (!onSale.length) return out;
  const ids = onSale.map((p) => p.id);
  const [{ data: files, error }, { data: takes }] = await Promise.all([
    admin.from("audiobook_files").select("project_id, duration_ms, is_sample").in("project_id", ids),
    admin.from("audio_takes").select("project_id, duration_ms, imported").in("project_id", ids).eq("imported", false),
  ]);
  if (error) return out;
  for (const p of onSale) {
    const finished = (files || []).filter((f) => f.project_id === p.id && !f.is_sample).reduce((n, f) => n + (f.duration_ms || 0), 0);
    if (!finished) continue;
    const recorded = (takes || []).filter((t) => t.project_id === p.id).reduce((n, t) => n + (t.duration_ms || 0), 0);
    out.set(p.id, { hours: finished / 3_600_000, humanNarrated: normalizeAudiobookSale(p.audiobook_sale).humanNarrated, recordedHere: recorded >= finished * 0.9 });
  }
  return out;
}

export type { AudiobookSale };

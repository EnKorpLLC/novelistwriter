import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { deleteObject, objectSize, r2Configured, signedUploadUrl } from "@/lib/r2";
import { mp3Ms, normalizeAudiobookSale, normalizeDirectSale } from "@/lib/direct-sale-rules";
import { AUDIO_SALES_HINT, audiobookFiles, audiobookKey, audiobookReadiness, fileTitle, isListeningFile, isSampleFile, adoptDeliveredFiles } from "@/lib/audiobook-sales";

async function ownerProject(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("projects").select("*").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return data ? { user, project: data } : null;
}

/** The audiobook's sale settings, its listening files, and whether it can be bought yet. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownerProject(id);
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const files = await audiobookFiles(admin, id);
  if (!files) return NextResponse.json({ migrationNeeded: true, error: AUDIO_SALES_HINT });
  const ready = await audiobookReadiness(admin, own.project);
  const { data: done } = await admin.from("narrator_jobs").select("id").eq("project_id", id).eq("status", "completed").limit(1);
  const { count: delivered } = done?.[0] ? await admin.from("narration_deliveries").select("id", { count: "exact", head: true }).eq("job_id", done[0].id).is("deleted_at", null) : { count: 0 };
  return NextResponse.json({
    sale: normalizeAudiobookSale(own.project.audiobook_sale),
    ebookPriceCents: normalizeDirectSale(own.project.direct_sale).priceCents,
    files,
    ready: ready.ok,
    reason: ready.ok ? null : ready.reason,
    storageReady: r2Configured(),
    canUseDelivered: Boolean(delivered),
  });
}

/**
 *   { action: "settings", sale }
 *   { action: "upload_url", name } → { url, key }   then   { action: "uploaded", name }
 *   { action: "use_delivered" }   (a narrator's finished files become the listening copy)
 *   { action: "clear" }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownerProject(id);
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(b.name || "").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 120);

  if (b.action === "settings") {
    const { error } = await admin.from("projects").update({ audiobook_sale: normalizeAudiobookSale(b.sale) }).eq("id", id);
    if (error) return NextResponse.json({ error: AUDIO_SALES_HINT }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (!r2Configured()) return NextResponse.json({ error: "Audio storage isn't set up yet." }, { status: 503 });
  if (b.action === "upload_url") {
    if (!isListeningFile(name)) return NextResponse.json({ error: "Only the exported MP3 files go on sale." }, { status: 400 });
    return NextResponse.json({ key: audiobookKey(id, name), url: await signedUploadUrl(audiobookKey(id, name), 3600) });
  }
  if (b.action === "uploaded") {
    const bytes = await objectSize(audiobookKey(id, name)).catch(() => null);
    if (bytes == null) return NextResponse.json({ error: `${name} didn't arrive. Try again.` }, { status: 400 });
    const num = Number(name.match(/^(\d{1,4})\s/)?.[1]);
    const { error } = await admin.from("audiobook_files").upsert(
      {
        project_id: id,
        sort: isSampleFile(name) ? 9999 : Number.isFinite(num) ? num : 0,
        title: fileTitle(name),
        file_name: name,
        r2_key: audiobookKey(id, name),
        bytes,
        duration_ms: mp3Ms(bytes),
        is_sample: isSampleFile(name),
      },
      { onConflict: "project_id,file_name" }
    );
    if (error) return NextResponse.json({ error: AUDIO_SALES_HINT }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "use_delivered") {
    try {
      return NextResponse.json({ ok: true, files: await adoptDeliveredFiles(admin, id) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't use the delivered files" }, { status: 400 });
    }
  }
  if (b.action === "clear") {
    const { data: files } = await admin.from("audiobook_files").select("id, r2_key").eq("project_id", id);
    for (const f of files || []) await deleteObject(f.r2_key as string).catch(() => null);
    await admin.from("audiobook_files").delete().eq("project_id", id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

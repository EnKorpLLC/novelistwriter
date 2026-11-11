import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { copyObject, r2Configured, signedDownloadUrl, signedUploadUrl, objectSize, deleteObject } from "@/lib/r2";
import { extraKey } from "@/lib/digital-extras";
import { extraFileType } from "@/lib/direct-sale-rules";
import { newCode } from "@/lib/marketplace";
import {
  JOBS_HINT,
  acceptQuote,
  approveMilestone,
  cancelJob,
  jobFor,
  jobPath,
  jobView,
  marketCheckoutUrl,
  milestonesOf,
  openDispute,
  sendQuote,
  type JobRow,
} from "@/lib/market-jobs";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/stripe";
import { normalizeQuote } from "@/lib/market-quotes";

const MAX_FILE_BYTES = 500 * 1024 * 1024;

async function load(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = createServiceClient();
  const found = await jobFor(admin, id, user.id);
  if (found === undefined) return { error: NextResponse.json({ error: JOBS_HINT }, { status: 500 }) };
  if (!found) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { user, admin, ...found };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await load(id);
  if ("error" in l) {
    // The platform admin can read any job (to settle disputes), but can't act on it here
    const auth = await requirePlatformAdmin();
    if (!auth.ok) return l.error;
    const { data: row } = await auth.admin.from("market_jobs").select("*").eq("id", id).maybeSingle();
    if (!row) return l.error;
    return NextResponse.json({ job: { ...(await jobView(auth.admin, row as JobRow, "author")), adminView: true }, storageReady: r2Configured() });
  }
  return NextResponse.json({ job: await jobView(l.admin, l.job, l.role), storageReady: r2Configured() });
}

/**
 * Pro:    quote { quote } · decline { reason } · deliver { milestoneId, note } · cancel { reason }
 * Author: accept { version } · pay { milestoneId } · approve { milestoneId } · changes { milestoneId, note } · cancel { reason }
 * Author: review { stars, body } (after completion) · use_cover { fileId } · add_extra { fileId }
 * Pro:    reply { body } (to a review)
 * Both:   message { body } · upload_url { name, kind, milestoneId? } then uploaded { key, name, kind, milestoneId? } · remove_file { fileId } · dispute { note }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await load(id);
  if ("error" in l) return l.error;
  const { admin, job, role, user } = l;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ms = () => milestonesOf(admin, job.id);
  const other = role === "author" ? job.pro_id : job.author_id;

  try {
    switch (b.action) {
      case "quote":
        if (role !== "pro") break;
        await sendQuote(admin, job, b.quote);
        return NextResponse.json({ ok: true });
      case "decline": {
        if (role !== "pro" || !["requested", "quoted"].includes(job.status)) break;
        await admin.from("market_jobs").update({ status: "declined", cancel_reason: String(b.reason || "").slice(0, 500), updated_at: new Date().toISOString() }).eq("id", job.id);
        await notify(admin, job.author_id, `A pro passed on "${job.title}"`, [String(b.reason || "They can't take it on right now.")], job.id);
        return NextResponse.json({ ok: true });
      }
      case "accept":
        if (role !== "author") break;
        await acceptQuote(admin, job, Number(b.version));
        return NextResponse.json({ ok: true });
      case "pay": {
        if (role !== "author") break;
        return NextResponse.json({ url: await marketCheckoutUrl(admin, job, String(b.milestoneId || ""), user.email || null) });
      }
      case "deliver": {
        if (role !== "pro" || job.status !== "agreed") break;
        const m = (await ms()).find((x) => x.id === b.milestoneId);
        if (!m || !["paid", "changes"].includes(m.status)) throw new Error("That milestone isn't ready to deliver: it has to be paid first.");
        const { data: files } = await admin.from("market_files").select("kind").eq("milestone_id", m.id).is("deleted_at", null);
        const note = String(b.note || "").trim().slice(0, 4000);
        if (!files?.some((f) => f.kind === "delivery") && !note) throw new Error("Attach your delivery files (or explain the delivery in a note).");
        const art = normalizeQuote(job.quote, job.market_type).rights !== null;
        const last = (await ms()).at(-1)?.id === m.id;
        if (art && last && !files?.some((f) => f.kind === "process")) throw new Error("Add your process proof (a sketch, a work in progress, or the layered file) to the final delivery.");
        await admin.from("market_milestones").update({ status: "delivered", delivered_at: new Date().toISOString(), delivery_note: note }).eq("id", m.id);
        await notify(admin, job.author_id, `Delivered: "${m.title}"`, [`Take a look and approve it, or ask for changes. If you don't answer in 14 days it counts as approved.`, note.slice(0, 400)], job.id);
        return NextResponse.json({ ok: true });
      }
      case "approve": {
        if (role !== "author" || job.status !== "agreed") break;
        const m = (await ms()).find((x) => x.id === b.milestoneId);
        if (!m || m.status !== "delivered") throw new Error("There's no delivery to approve on that milestone.");
        await approveMilestone(admin, job, m);
        return NextResponse.json({ ok: true });
      }
      case "changes": {
        if (role !== "author" || job.status !== "agreed") break;
        const m = (await ms()).find((x) => x.id === b.milestoneId);
        if (!m || m.status !== "delivered") throw new Error("There's no delivery to ask changes on.");
        const included = normalizeQuote(job.quote, job.market_type).revisions;
        if (m.revisions_used >= included) throw new Error(`The ${included} included ${included === 1 ? "round is" : "rounds are"} used. Approve it, agree extra work with the pro, or ask us to step in.`);
        const note = String(b.note || "").trim().slice(0, 4000);
        if (!note) throw new Error("Say what you'd like changed.");
        await admin.from("market_milestones").update({ status: "changes", revisions_used: m.revisions_used + 1 }).eq("id", m.id);
        await admin.from("market_messages").insert({ job_id: job.id, sender_id: user.id, body: `Changes requested on "${m.title}": ${note}` });
        await notify(admin, job.pro_id, `Changes requested: "${m.title}"`, [note.slice(0, 600)], job.id);
        return NextResponse.json({ ok: true });
      }
      case "cancel":
        await cancelJob(admin, job, role, String(b.reason || "").trim());
        return NextResponse.json({ ok: true });
      case "dispute": {
        const note = String(b.note || "").trim();
        if (note.length < 20) throw new Error("Tell us what's wrong in a sentence or two.");
        await openDispute(admin, job, role, note);
        return NextResponse.json({ ok: true });
      }
      case "message": {
        const body = String(b.body || "").trim().slice(0, 4000);
        if (!body) throw new Error("Write a message first.");
        if (!other && role === "author") throw new Error("They haven't accepted the invite yet.");
        await admin.from("market_messages").insert({ job_id: job.id, sender_id: user.id, body });
        await notify(admin, other, `New message: "${job.title}"`, [body.slice(0, 600)], job.id);
        return NextResponse.json({ ok: true });
      }
      case "upload_url": {
        if (!r2Configured()) throw new Error("File storage isn't set up yet.");
        const kind = b.kind === "brief" ? "brief" : b.kind === "process" ? "process" : "delivery";
        if (kind === "brief" && role !== "author") break;
        if (kind !== "brief" && role !== "pro") break;
        const name = String(b.name || "").replace(/[\\/:*?"<>|#%]+/g, "").trim().slice(0, 120);
        if (!name) throw new Error("That file needs a name.");
        const key = `market/${job.id}/${newCode()}-${name}`;
        return NextResponse.json({ key, url: await signedUploadUrl(key, 3600) });
      }
      case "uploaded": {
        const key = String(b.key || "");
        if (!key.startsWith(`market/${job.id}/`) || key.includes("..")) throw new Error("Upload not found.");
        const bytes = await objectSize(key).catch(() => null);
        if (bytes == null) throw new Error("The file didn't arrive. Try again.");
        if (bytes > MAX_FILE_BYTES) {
          await deleteObject(key).catch(() => null);
          throw new Error("Files can be up to 500 MB.");
        }
        const kind = b.kind === "brief" ? "brief" : b.kind === "process" ? "process" : "delivery";
        const milestoneId = kind === "brief" ? null : (await ms()).find((x) => x.id === b.milestoneId)?.id || null;
        if (kind !== "brief" && !milestoneId) throw new Error("Pick the milestone this belongs to.");
        await admin.from("market_files").insert({ job_id: job.id, milestone_id: milestoneId, uploader_id: user.id, kind, name: String(b.name || "file").slice(0, 120), r2_key: key, bytes });
        return NextResponse.json({ ok: true });
      }
      case "review": {
        if (role !== "author" || job.status !== "completed" || !job.pro_id) break;
        const stars = Math.round(Number(b.stars));
        if (!(stars >= 1 && stars <= 5)) throw new Error("Pick from one to five stars.");
        const body = String(b.body || "").trim().slice(0, 2000);
        const { error } = await admin.from("market_reviews").insert({ job_id: job.id, author_id: job.author_id, pro_id: job.pro_id, stars, body });
        if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "You've already reviewed this job." : "Reviews need a database update (migration_market_reviews.sql).");
        await notify(admin, job.pro_id, `New review: "${job.title}"`, [`${"★".repeat(stars)}${"☆".repeat(5 - stars)}`, body.slice(0, 400)], job.id);
        return NextResponse.json({ ok: true });
      }
      case "reply": {
        if (role !== "pro") break;
        const body = String(b.body || "").trim().slice(0, 1000);
        if (!body) throw new Error("Write your reply first.");
        const { data: r } = await admin.from("market_reviews").select("id, reply").eq("job_id", job.id).maybeSingle();
        if (!r) throw new Error("There's no review to reply to.");
        if (r.reply) throw new Error("You've already replied.");
        await admin.from("market_reviews").update({ reply: body, replied_at: new Date().toISOString() }).eq("id", r.id);
        return NextResponse.json({ ok: true });
      }
      case "use_cover":
      case "add_extra": {
        if (role !== "author" || !job.project_id) break;
        const { data: f } = await admin.from("market_files").select("*").eq("id", String(b.fileId || "")).eq("job_id", job.id).is("deleted_at", null).maybeSingle();
        const m = f?.milestone_id ? (await ms()).find((x) => x.id === f.milestone_id) : null;
        if (!f || f.kind !== "delivery" || !m || !["delivered", "approved"].includes(m.status)) throw new Error("Pick a delivered file.");
        const ext = (String(f.name).split(".").pop() || "").toLowerCase();
        if (b.action === "use_cover") {
          const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : null;
          if (!type) throw new Error("Covers need a JPG, PNG, or WebP file. Ask the artist for an ebook-size JPG.");
          if (Number(f.bytes) > 5 * 1024 * 1024) throw new Error("Covers need to be under 5 MB. Ask the artist for an ebook-size JPG (about 1600×2560).");
          const res = await fetch(await signedDownloadUrl(f.r2_key as string, 300));
          if (!res.ok) throw new Error("Couldn't open the file. Try again.");
          const path = `${job.author_id}/${job.project_id}.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`;
          await admin.storage.from("covers").remove(["jpg", "png", "webp"].map((e) => `${job.author_id}/${job.project_id}.${e}`));
          const { error: upErr } = await admin.storage.from("covers").upload(path, Buffer.from(await res.arrayBuffer()), { contentType: type, upsert: true });
          if (upErr) throw new Error(`The cover didn't save: ${upErr.message}`);
          await admin.from("projects").update({ cover_path: path, updated_at: new Date().toISOString() }).eq("id", job.project_id).eq("user_id", job.author_id);
          return NextResponse.json({ ok: true });
        }
        // Selling art as an extra needs the merchandise add-on (or a buyout) in the agreement
        const rights = normalizeQuote(job.quote, job.market_type).rights;
        if (rights !== "license_merch" && rights !== "buyout") throw new Error("Your agreement covers using this art in and around the book, not selling it. Ask the artist about the merchandise add-on.");
        if (!extraFileType(String(f.name))) throw new Error("That kind of file can't be sold as an extra.");
        const { data: extra, error: exErr } = await admin
          .from("book_extras")
          .insert({ project_id: job.project_id, author_user_id: job.author_id, title: String(f.name).replace(/\.[^.]+$/, "").slice(0, 120), kind: "art", price_cents: null, with_ebook: true, active: false, rights_confirmed_at: new Date().toISOString() })
          .select("id")
          .single();
        if (exErr || !extra) throw new Error("Extras need a database update (migration_preorders_extras.sql).");
        const key = extraKey(job.project_id, extra.id as string, String(f.name));
        await copyObject(f.r2_key as string, key);
        await admin.from("book_extras").update({ files: [{ name: f.name, key, bytes: Number(f.bytes) || 0 }] }).eq("id", extra.id);
        return NextResponse.json({ ok: true });
      }
      case "remove_file": {
        const { data: f } = await admin.from("market_files").select("id, r2_key, uploader_id, milestone_id").eq("id", String(b.fileId || "")).eq("job_id", job.id).maybeSingle();
        if (!f || f.uploader_id !== user.id) throw new Error("You can only remove your own files.");
        const m = f.milestone_id ? (await ms()).find((x) => x.id === f.milestone_id) : null;
        if (m && ["delivered", "approved"].includes(m.status)) throw new Error("That file is part of a delivery the author has.");
        await deleteObject(f.r2_key as string).catch(() => null);
        await admin.from("market_files").update({ deleted_at: new Date().toISOString() }).eq("id", f.id);
        return NextResponse.json({ ok: true });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 400 });
  }
  return NextResponse.json({ error: "That isn't something you can do on this job right now." }, { status: 400 });
}

async function notify(admin: ReturnType<typeof createServiceClient>, userId: string | null, subject: string, paragraphs: string[], jobId: string) {
  if (!userId) return;
  const { data } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (!data?.email) return;
  const mail = renderEmail({ heading: subject, paragraphs: paragraphs.filter(Boolean), button: { label: "Open the job", url: appUrl(jobPath(jobId)) } });
  await sendEmail({ to: data.email as string, subject, html: mail.html, text: mail.text }).catch(() => null);
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { deleteObject, r2Configured, signedUploadUrl } from "@/lib/r2";
import { appUrl } from "@/lib/stripe";
import {
  MARKET_HINT,
  applicationProblem,
  emailNewApplication,
  newCode,
  proFor,
  profileFields,
  signPortfolio,
  startPro,
  typeStatuses,
} from "@/lib/marketplace";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The signed-in pro's profile, how their types are filling up, and their invite link. */
export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const row = await proFor(admin, user.id);
  if (row === undefined) return NextResponse.json({ migrationNeeded: true, error: MARKET_HINT });
  const types = (await typeStatuses(admin)) || [];
  if (!row) return NextResponse.json({ profile: null, types });
  const { count: recruited } = await admin.from("pro_profiles").select("user_id", { count: "exact", head: true }).eq("invited_by", user.id);
  return NextResponse.json({
    profile: {
      name: row.name,
      headline: row.headline,
      bio: row.bio,
      specialties: row.specialties,
      genres: row.genres,
      rateNote: row.rate_note,
      turnaroundNote: row.turnaround_note,
      website: row.website,
      portfolio: await signPortfolio(row.portfolio, user.id),
      status: row.status,
      promised: Boolean(row.promise_at),
      adminNote: row.admin_note,
      founding: row.founding,
    },
    inviteUrl: row.invite_code ? appUrl(`/pros/join?invite=${row.invite_code}`) : null,
    recruited: recruited || 0,
    storageReady: r2Configured(),
    types,
  });
}

/**
 *   { action: "start", name?, invite? }
 *   { action: "save", ...fields }          (any time; an approved profile stays approved)
 *   { action: "submit", ...fields, promise: true }
 *   { action: "pause" } / { action: "resume" }
 *   { action: "upload_url", name } → { url, key }   (portfolio images)
 */
export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (b.action === "start") {
    try {
      await startPro(admin, user.id, { name: String(b.name || ""), invite: String(b.invite || "") || null });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : MARKET_HINT }, { status: 500 });
    }
  }

  const row = await proFor(admin, user.id);
  if (row === undefined) return NextResponse.json({ error: MARKET_HINT }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Start your profile first." }, { status: 400 });
  if (row.status === "removed") return NextResponse.json({ error: "This profile was removed from the marketplace." }, { status: 403 });

  if (b.action === "upload_url") {
    if (!r2Configured()) return NextResponse.json({ error: "Image uploads aren't set up yet. Add a link instead." }, { status: 503 });
    const name = String(b.name || "").replace(/[^\w.\- ]+/g, "").trim().slice(0, 80);
    if (!/\.(jpe?g|png|webp|gif)$/i.test(name)) return NextResponse.json({ error: "Images only (JPG, PNG, WebP, GIF)." }, { status: 400 });
    const key = `pros/${user.id}/${newCode()}-${name}`;
    return NextResponse.json({ key, url: await signedUploadUrl(key, 900) });
  }

  if (b.action === "pause" || b.action === "resume") {
    if (b.action === "pause" && row.status === "approved") await admin.from("pro_profiles").update({ status: "paused" }).eq("user_id", user.id);
    if (b.action === "resume" && row.status === "paused") await admin.from("pro_profiles").update({ status: "approved" }).eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "save" || b.action === "submit") {
    const fields = profileFields(b, user.id);
    // Images taken out of the portfolio are deleted from storage
    const kept = new Set(fields.portfolio.map((i) => i.key).filter(Boolean));
    const before = Array.isArray(row.portfolio) ? (row.portfolio as { key?: string }[]) : [];
    for (const old of before) if (old.key && !kept.has(old.key)) await deleteObject(old.key).catch(() => null);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { ...fields, updated_at: now };
    if (b.action === "submit") {
      const problem = applicationProblem(fields, b.promise === true || Boolean(row.promise_at));
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      patch.promise_at = row.promise_at || now;
      if (["draft", "changes", "declined"].includes(row.status)) {
        // An invite from the admin skips the queue
        const { data: inv } = row.invite_id ? await admin.from("pro_invites").select("skip_queue").eq("id", row.invite_id).maybeSingle() : { data: null };
        patch.submitted_at = now;
        if (inv?.skip_queue) {
          const statuses = (await typeStatuses(admin)) || [];
          Object.assign(patch, { status: "approved", approved_at: now, founding: statuses.some((s) => fields.specialties.includes(s.id) && s.state !== "open") });
        } else {
          patch.status = "applied";
        }
      }
    }
    const { error } = await admin.from("pro_profiles").update(patch).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: MARKET_HINT }, { status: 500 });
    if (patch.status === "applied") await emailNewApplication(admin, fields.name, fields.specialties).catch(() => null);
    return NextResponse.json({ ok: true, status: (patch.status as string) || row.status });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

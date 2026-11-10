import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { computeWritingRecord } from "@/lib/writing-record";
import { CONDUCT_FLAG_AT, SAFETY_MIGRATION_HINT } from "@/lib/reader-safety";
import { notifyUser } from "@/lib/notifications";

/** Open reports first, with the book, the author, how many people reported them, and (for AI concerns) the writing record. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { data: reports, error } = await admin.from("trust_reports").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: /trust_reports/.test(error.message) ? SAFETY_MIGRATION_HINT : error.message }, { status: 500 });

  const rows = reports || [];
  const projectIds = [...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[];
  const userIds = [...new Set(rows.flatMap((r) => [r.target_user_id, r.reporter_user_id]).filter(Boolean))] as string[];
  const [{ data: projects }, { data: profiles }] = await Promise.all([
    projectIds.length ? admin.from("projects").select("id, title, record_public, slug").in("id", projectIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("profiles").select("*").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const projectOf = new Map((projects || []).map((p) => [p.id as string, p]));
  const profileOf = new Map((profiles || []).map((p) => [p.id as string, p as { display_name: string | null; email: string | null; handle: string | null; catalog_suspended_at?: string | null }]));

  // How many different people reported each author's conduct
  const reporters = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.kind !== "conduct" || !r.target_user_id || r.status === "dismissed") continue;
    (reporters.get(r.target_user_id) || reporters.set(r.target_user_id, new Set()).get(r.target_user_id)!).add(r.reporter_user_id || r.reporter_email || r.id);
  }

  // Writing record numbers for open AI concerns, so the check starts with the evidence
  const recordFor = new Map<string, Awaited<ReturnType<typeof computeWritingRecord>>>();
  for (const id of [...new Set(rows.filter((r) => r.kind === "ai_concern" && r.status === "open" && r.project_id).map((r) => r.project_id as string))].slice(0, 20)) {
    recordFor.set(id, await computeWritingRecord(admin, id).catch(() => null as never));
  }

  return NextResponse.json({
    flagAt: CONDUCT_FLAG_AT,
    reports: rows.map((r) => {
      const target = r.target_user_id ? profileOf.get(r.target_user_id) : null;
      const reporter = r.reporter_user_id ? profileOf.get(r.reporter_user_id) : null;
      const rec = r.project_id ? recordFor.get(r.project_id) : null;
      return {
        id: r.id,
        kind: r.kind,
        reason: r.reason,
        details: r.details,
        status: r.status,
        adminNote: r.admin_note,
        createdAt: r.created_at,
        book: r.project_id ? { id: r.project_id, title: projectOf.get(r.project_id)?.title || "Untitled" } : null,
        target: r.target_user_id
          ? { id: r.target_user_id, name: target?.display_name || "Author", email: target?.email || null, handle: target?.handle || null, suspended: Boolean(target?.catalog_suspended_at) }
          : null,
        reporter: reporter ? `${reporter.display_name || "Reader"} (${reporter.email || "no email"})` : String(r.reporter_email || "").startsWith("guest:") ? "A visitor (no account)" : r.reporter_email || "A visitor",
        conductReporters: r.target_user_id ? reporters.get(r.target_user_id)?.size || 0 : 0,
        record: rec
          ? { typedPercent: Math.round(rec.typedShare * 100), sessions: rec.sessions, spanDays: rec.spanDays, recordedWords: rec.recordedWords, importedWords: rec.importedWords, beforeRecordsWords: rec.beforeRecordsWords, badge: rec.badge, flaggedSessions: rec.flaggedSessions }
          : null,
      };
    }),
  });
}

/**
 *   { id, status, note } closes or reopens a report;
 *   { userId, suspend } removes an author from the reader catalogs, or restores them (they're told either way).
 */
export async function PATCH(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string; note?: string; userId?: string; suspend?: boolean };

  if (body.userId && typeof body.suspend === "boolean") {
    const { error } = await admin.from("profiles").update({ catalog_suspended_at: body.suspend ? new Date().toISOString() : null }).eq("id", body.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await notifyUser(admin, body.userId, {
      type: "application_update",
      title: body.suspend ? "Your books were removed from the reader catalog" : "Your books are back in the reader catalog",
      body: body.suspend
        ? "After several reports about how readers were treated, your beta reads and advance copies no longer appear in the reader catalog. Readers you already work with aren't affected. Reply through the contact page to talk with us."
        : "Readers can find your beta reads and advance copies in the catalog again.",
      href: "/conduct",
    });
    return NextResponse.json({ ok: true });
  }

  if (!["open", "reviewed", "dismissed", "actioned"].includes(String(body.status))) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  await admin
    .from("trust_reports")
    .update({ status: body.status, admin_note: String(body.note || "").slice(0, 1000), reviewed_at: body.status === "open" ? null : new Date().toISOString() })
    .eq("id", String(body.id || ""));
  return NextResponse.json({ ok: true });
}

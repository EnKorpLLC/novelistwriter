import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { HIRING_LIVE, MARKET_HINT, invitePro, reviewPro, signPortfolio, typeStatuses, type ProRow } from "@/lib/marketplace";
import { isMarketType } from "@/lib/market-types";

/** Every type's counts and settings, applications to review, approved pros, and invites sent. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const types = await typeStatuses(admin);
  if (!types) return NextResponse.json({ migrationNeeded: true, error: MARKET_HINT });
  const [{ data: rows }, { data: invites }] = await Promise.all([
    admin.from("pro_profiles").select("*").neq("status", "draft").order("submitted_at", { ascending: false }).limit(300),
    admin.from("pro_invites").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  const ids = (rows || []).map((r) => r.user_id as string);
  const { data: emails } = ids.length ? await admin.from("profiles").select("id, email").in("id", ids) : { data: [] };
  const emailOf = new Map((emails || []).map((e) => [e.id as string, (e.email as string) || ""]));
  const recruitedBy = new Map<string, number>();
  for (const r of rows || []) if (r.invited_by) recruitedBy.set(r.invited_by, (recruitedBy.get(r.invited_by) || 0) + 1);
  const pros = await Promise.all(
    ((rows || []) as ProRow[]).map(async (r) => ({
      userId: r.user_id,
      email: emailOf.get(r.user_id) || "",
      name: r.name,
      headline: r.headline,
      bio: r.bio,
      specialties: r.specialties,
      genres: r.genres,
      rateNote: r.rate_note,
      turnaroundNote: r.turnaround_note,
      website: r.website,
      status: r.status,
      founding: r.founding,
      adminNote: r.admin_note,
      submittedAt: r.submitted_at,
      recruited: recruitedBy.get(r.user_id) || 0,
      viaInvite: Boolean(r.invite_id),
      // Only applications under review need their images signed
      portfolio: r.status === "applied" ? await signPortfolio(r.portfolio, r.user_id) : [],
      portfolioCount: Array.isArray(r.portfolio) ? r.portfolio.length : 0,
    }))
  );
  return NextResponse.json({
    hiringLive: HIRING_LIVE,
    types,
    pros,
    invites: (invites || []).map((i) => ({ email: i.email, type: i.market_type, skipQueue: i.skip_queue, accepted: Boolean(i.accepted_at), createdAt: i.created_at })),
  });
}

/**
 *   { action: "review", userId, decision: "approve" | "decline" | "changes", note }
 *   { action: "remove", userId, note }
 *   { action: "setting", type, threshold?, override? }
 *   { action: "invite", email, type, skipQueue, note }
 */
export async function POST(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (b.action === "review" && (b.decision === "approve" || b.decision === "decline" || b.decision === "changes")) {
      await reviewPro(admin, String(b.userId || ""), b.decision, String(b.note || ""));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      await admin.from("pro_profiles").update({ status: "removed", admin_note: String(b.note || "").slice(0, 1000) }).eq("user_id", String(b.userId || ""));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "setting" && isMarketType(b.type)) {
      const patch: Record<string, unknown> = { market_type: b.type, updated_at: new Date().toISOString() };
      const threshold = Math.round(Number(b.threshold));
      if (threshold >= 1 && threshold <= 100) patch.threshold = threshold;
      if (b.override === "auto" || b.override === "open" || b.override === "closed") patch.override = b.override;
      const { error } = await admin.from("market_settings").upsert(patch, { onConflict: "market_type" });
      if (error) throw new Error(MARKET_HINT);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "invite" && isMarketType(b.type)) {
      const email = String(b.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter their email." }, { status: 400 });
      await invitePro(admin, { email, type: b.type, skipQueue: b.skipQueue !== false, note: String(b.note || "").trim().slice(0, 600) });
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

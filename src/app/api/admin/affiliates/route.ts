import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { notifyUser } from "@/lib/notifications";
import { AFFILIATES_MIGRATION_HINT, affiliateSummary, isMissingAffiliateTable, runAffiliatePayouts } from "@/lib/affiliates";

export const maxDuration = 60;

/** Applications, approved affiliates with what they're owed, and recent payouts (including failures). */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { data: rows, error } = await admin.from("affiliates").select("*").order("applied_at", { ascending: false }).limit(300);
  if (error) return NextResponse.json({ error: isMissingAffiliateTable(error.message) ? AFFILIATES_MIGRATION_HINT : error.message }, { status: 500 });
  const ids = (rows || []).map((r) => r.user_id as string);
  const [{ data: profiles }, { data: payouts }] = await Promise.all([
    ids.length ? admin.from("profiles").select("id, display_name, email, handle").in("id", ids) : Promise.resolve({ data: [] }),
    admin.from("affiliate_payouts").select("affiliate_user_id, amount_cents, status, error, created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const byId = new Map((profiles || []).map((p) => [p.id as string, p as { display_name: string | null; email: string | null; handle: string | null }]));
  const approved = (rows || []).filter((r) => r.status === "approved");
  const summaries = new Map(await Promise.all(approved.map(async (r) => [r.user_id as string, await affiliateSummary(admin, r.user_id)] as const)));
  return NextResponse.json({
    affiliates: (rows || []).map((r) => {
      const p = byId.get(r.user_id);
      const s = summaries.get(r.user_id);
      return {
        userId: r.user_id,
        name: p?.display_name || "User",
        email: p?.email || null,
        handle: p?.handle || null,
        status: r.status,
        website: r.website,
        audience: r.audience,
        appliedAt: r.applied_at,
        adminNote: r.admin_note,
        payoutsEnabled: r.payouts_enabled,
        hasPayoutAccount: Boolean(r.stripe_account_id),
        summary: s ? { signups: s.signups, payingCustomers: s.payingCustomers, onHoldCents: s.onHoldCents, readyCents: s.readyCents, paidCents: s.paidCents } : null,
      };
    }),
    payouts: (payouts || []).map((p) => ({ ...p, name: byId.get(p.affiliate_user_id)?.display_name || "User" })),
  });
}

/** Approve, reject, or suspend an affiliate. */
export async function PATCH(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const body = (await req.json().catch(() => ({}))) as { userId?: string; status?: string; note?: string };
  if (!["approved", "rejected", "suspended"].includes(String(body.status))) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  const { data: row } = await admin.from("affiliates").select("user_id").eq("user_id", String(body.userId || "")).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await admin
    .from("affiliates")
    .update({ status: body.status, admin_note: String(body.note || "").slice(0, 500), decided_at: new Date().toISOString() })
    .eq("user_id", row.user_id);
  const copy =
    body.status === "approved"
      ? { title: "You're a Novelist Writer affiliate", body: "Your link is ready. Set up payouts so we can send your commissions." }
      : body.status === "rejected"
        ? { title: "About your affiliate application", body: body.note ? `We can't approve it right now: ${body.note}` : "We can't approve it right now. You're welcome to apply again later." }
        : { title: "Your affiliate account is paused", body: body.note || "New commissions are paused while we take a look. Reply through the contact page with any questions." };
  await notifyUser(admin, row.user_id, { type: "affiliate", ...copy, href: "/dashboard/affiliate" });
  return NextResponse.json({ ok: true });
}

/** Pay everyone who's owed at least $25 now, instead of waiting for the 1st. */
export async function POST() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const result = await runAffiliatePayouts(auth.admin, { timeBudgetMs: 40_000 });
  return NextResponse.json(result);
}

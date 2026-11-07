import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getSetting, moneySummary, setSetting, snapshotMrr, syncFromStripe, usageNow } from "@/lib/money";

export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Money in, money out, net, and free-tier usage for the admin Money tab. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const mrr = await getSetting<{ at?: string }>(auth.admin, "mrr", {});
  // Refresh the subscription snapshot at most once a day so the tab stays fast
  if (!mrr.at || Date.now() - Date.parse(mrr.at) > DAY_MS) {
    await snapshotMrr(auth.admin).catch(() => null);
  }
  const [summary, usage] = await Promise.all([moneySummary(auth.admin), usageNow(auth.admin)]);
  return NextResponse.json({ ...summary, usage });
}

type Body =
  | { action: "sync" }
  | { action: "addCost"; service: string; amountCents: number; cadence: string; startedOn?: string; notes?: string }
  | { action: "endCost"; id: string; endedOn?: string }
  | { action: "deleteCost"; id: string }
  | { action: "setAiCost"; usdPerCredit: number }
  | { action: "setEgress"; gb: number }
  | { action: "vercelUpgraded" };

export async function POST(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const body = (await req.json()) as Body;
  const admin = auth.admin;

  try {
    if (body.action === "sync") {
      return NextResponse.json({ ok: true, ...(await syncFromStripe(admin)) });
    }
    if (body.action === "addCost") {
      const service = String(body.service || "").trim().slice(0, 80);
      const amountCents = Math.round(Number(body.amountCents));
      if (!service || !Number.isFinite(amountCents) || amountCents < 0) {
        return NextResponse.json({ error: "Service name and a dollar amount are required." }, { status: 400 });
      }
      if (!["monthly", "yearly", "one_time"].includes(body.cadence)) {
        return NextResponse.json({ error: "Choose monthly, yearly, or one time." }, { status: 400 });
      }
      const { error } = await admin.from("admin_costs").insert({
        service,
        amount_cents: amountCents,
        cadence: body.cadence,
        started_on: body.startedOn || new Date().toISOString().slice(0, 10),
        notes: String(body.notes || "").slice(0, 300),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "endCost") {
      const { error } = await admin
        .from("admin_costs")
        .update({ ended_on: body.endedOn || new Date().toISOString().slice(0, 10) })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "deleteCost") {
      const { error } = await admin.from("admin_costs").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "setAiCost") {
      const usd = Number(body.usdPerCredit);
      if (!Number.isFinite(usd) || usd < 0) return NextResponse.json({ error: "Enter a cost of 0 or more." }, { status: 400 });
      await setSetting(admin, "ai_cost", { usdPerCredit: usd });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "setEgress") {
      const gb = Number(body.gb);
      if (!Number.isFinite(gb) || gb < 0) return NextResponse.json({ error: "Enter GB used this month." }, { status: 400 });
      await setSetting(admin, "supabase_egress", { gb, at: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "vercelUpgraded") {
      const flags = await getSetting<Record<string, string>>(admin, "first_sale", {});
      await setSetting(admin, "first_sale", { ...flags, vercelUpgradedAt: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const hint = /admin_costs|admin_settings|revenue_events/.test(message)
      ? "Database needs an update. Run supabase/migration_money.sql in the Supabase SQL editor."
      : message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

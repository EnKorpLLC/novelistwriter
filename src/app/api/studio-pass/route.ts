import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPassState, PASS_BANK_CAP, startPass } from "@/lib/studio-pass";
import { reconcileAuthorAccess } from "@/lib/studio-access";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [state, { data: visits }, { data: ledger }] = await Promise.all([
    getPassState(admin, user.id),
    admin.from("share_visits").select("day").eq("referrer_user_id", user.id).gte("day", since30),
    admin
      .from("studio_pass_ledger")
      .select("days, credited_days, reason, meta, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const earned = (ledger || []).filter((l) => l.days > 0 && l.reason !== "returned_on_subscribe");
  return NextResponse.json({
    ...state,
    cap: PASS_BANK_CAP,
    stats: {
      visitsToday: (visits || []).filter((v) => v.day === today).length,
      visits30: (visits || []).length,
      readerJoins: earned.filter((l) => l.reason === "reader_join").length,
      authorSignups: earned.filter((l) => l.reason === "author_signup").length,
      daysEarned: earned.reduce((n, l) => n + (l.credited_days || 0), 0),
    },
    history: (ledger || []).map((l) => ({
      days: l.credited_days,
      reason: l.reason,
      createdAt: l.created_at,
    })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const admin = createServiceClient();

  if (body.action === "start") {
    const before = await getPassState(admin, user.id);
    if (before.bankDays <= 0) {
      return NextResponse.json({ error: "No banked days to start yet." }, { status: 400 });
    }
    const state = await startPass(admin, user.id);
    await reconcileAuthorAccess(admin, user.id);
    return NextResponse.json({ ok: true, ...state });
  }

  if (body.action === "dismissEnded") {
    await admin
      .from("credit_balances")
      .update({ pass_ended_dismissed_at: new Date().toISOString() })
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

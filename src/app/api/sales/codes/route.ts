import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SALES_MIGRATION_HINT, codeFromRow, sellerTier } from "@/lib/direct-sales";
import { normalizeCode } from "@/lib/direct-sale-rules";

async function seller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createServiceClient();
  return { user, admin, tier: await sellerTier(admin, user.id) };
}

/** The author's discount codes. */
export async function GET() {
  const s = await seller();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await s.admin.from("discount_codes").select("*").eq("author_user_id", s.user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ migrationNeeded: true, error: SALES_MIGRATION_HINT, codes: [] });
  return NextResponse.json({ codes: (data || []).map(codeFromRow) });
}

/** Create: { code, percentOff? | amountOffCents?, projectIds?, maxUses?, endsOn? } */
export async function POST(req: Request) {
  const s = await seller();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!s.tier) return NextResponse.json({ error: "Discount codes are part of Pro and Studio." }, { status: 402 });
  const b = (await req.json().catch(() => ({}))) as { code?: string; percentOff?: number; amountOffCents?: number; projectIds?: string[]; maxUses?: number; endsOn?: string };
  const code = normalizeCode(b.code);
  if (!code) return NextResponse.json({ error: "Codes use 3 to 24 letters, numbers, or dashes." }, { status: 400 });
  const pct = Math.round(Number(b.percentOff));
  const amount = Math.round(Number(b.amountOffCents));
  if (!(pct >= 1 && pct <= 90) && !(amount > 0)) return NextResponse.json({ error: "Set a percent off (1 to 90) or an amount off." }, { status: 400 });
  const { count } = await s.admin.from("discount_codes").select("id", { count: "exact", head: true }).eq("author_user_id", s.user.id);
  if ((count || 0) >= 100) return NextResponse.json({ error: "You can have up to 100 codes. Delete old ones first." }, { status: 400 });

  // Only the author's own books
  const wanted = (b.projectIds || []).slice(0, 50);
  const { data: own } = wanted.length ? await s.admin.from("projects").select("id").eq("user_id", s.user.id).in("id", wanted) : { data: [] };
  const { error } = await s.admin.from("discount_codes").insert({
    author_user_id: s.user.id,
    code,
    percent_off: pct >= 1 && pct <= 90 ? pct : null,
    amount_off_cents: pct >= 1 && pct <= 90 ? null : amount,
    project_ids: (own || []).map((p) => p.id),
    max_uses: Number(b.maxUses) > 0 ? Math.round(Number(b.maxUses)) : null,
    ends_on: /^\d{4}-\d{2}-\d{2}$/.test(String(b.endsOn || "")) ? b.endsOn : null,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return NextResponse.json({ error: "You already have a code with that name." }, { status: 400 });
    return NextResponse.json({ error: SALES_MIGRATION_HINT }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Turn a code on or off: { id, active } */
export async function PATCH(req: Request) {
  const s = await seller();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; active?: boolean };
  await s.admin.from("discount_codes").update({ active: b.active === true }).eq("id", String(b.id || "")).eq("author_user_id", s.user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await seller();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string };
  await s.admin.from("discount_codes").delete().eq("id", String(b.id || "")).eq("author_user_id", s.user.id);
  return NextResponse.json({ ok: true });
}

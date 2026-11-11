import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { keepPreorder, preorderByToken, refundPreorder } from "@/lib/preorders";

/** The buyer's link is the key: { token, action: "cancel" } for a full refund, or { token, action: "keep" } after the date moves. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { token?: string; action?: string };
  const token = String(b.token || "");
  if (!/^[\w-]{20,64}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const p = await preorderByToken(admin, token);
  if (!p) return NextResponse.json({ error: "This pre-order isn't waiting anymore." }, { status: 409 });
  try {
    if (b.action === "cancel") {
      await refundPreorder(admin, p.row, "cancelled");
      return NextResponse.json({ ok: true, cancelled: true });
    }
    if (b.action === "keep") return NextResponse.json({ ok: true, releaseDate: await keepPreorder(admin, token) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong. Try again." }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { cancelPaperback } from "@/lib/print-sales";

/** The buyer's link is the key: { token } cancels a paperback order within the hour, before printing, for a full refund. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { token?: string };
  const token = String(b.token || "");
  if (!/^[\w-]{20,64}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await cancelPaperback(createServiceClient(), token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't cancel the order." }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { luluSignatureOk, type PrintJob } from "@/lib/lulu";
import { applyPrintStatus } from "@/lib/print-sales";

/** Lulu's PRINT_JOB_STATUS_CHANGED webhook: production, shipping and tracking, or a problem with an order. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!luluSignatureOk(raw, req.headers.get("lulu-hmac-sha256"))) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  const body = JSON.parse(raw || "{}") as { topic?: string; data?: PrintJob & { external_id?: string } };
  if (body.topic !== "PRINT_JOB_STATUS_CHANGED" || !body.data?.id) return NextResponse.json({ ok: true, ignored: true });
  try {
    await applyPrintStatus(createServiceClient(), body.data);
  } catch (e) {
    console.error("lulu webhook failed", body.data.id, e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { buyerCountryAllowed } from "@/lib/direct-sales";
import { paperbackReadiness, shippingQuotes } from "@/lib/print-sales";
import { US_STATES } from "@/lib/print-rules";

/** Shipping prices for a paperback to a US state and ZIP code: { projectId, state, zip, proof? } */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { projectId?: string; state?: string; zip?: string; proof?: boolean };
  const state = String(b.state || "").toUpperCase();
  const zip = String(b.zip || "").trim();
  if (!US_STATES.includes(state) || !/^\d{5}$/.test(zip)) return NextResponse.json({ error: "Pick your state and enter a 5-digit ZIP code." }, { status: 400 });
  if (!(await buyerCountryAllowed())) return NextResponse.json({ error: "Paperbacks ship to US addresses for now." }, { status: 403 });
  const admin = createServiceClient();
  const { data: project } = await admin.from("projects").select("id, user_id, published").eq("id", String(b.projectId || "")).maybeSingle();
  if (!project) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  if (b.proof) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id !== project.user_id) return NextResponse.json({ error: "Only the author can order a proof." }, { status: 403 });
  }
  const ready = await paperbackReadiness(admin, project, { proof: Boolean(b.proof) });
  if (!ready.ok) return NextResponse.json({ error: ready.reason }, { status: 400 });
  const levels = await shippingQuotes(ready.edition, ready.pod, state, zip);
  if (!levels.length) return NextResponse.json({ error: "Shipping prices aren't available right now. Try again in a moment." }, { status: 503 });
  return NextResponse.json({ levels: levels.map((l) => ({ id: l.id, label: l.label, note: l.note, cents: l.cents })), priceCents: b.proof ? ready.edition.print_cost_cents : ready.edition.price_cents });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SHOP_HINT, authorOrders, markShipped } from "@/lib/shop";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The author's shop orders: what to ship (with addresses), and what's shipped. */
export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orders = await authorOrders(createServiceClient(), user.id);
  if (!orders) return NextResponse.json({ migrationNeeded: true, error: SHOP_HINT, orders: [] });
  return NextResponse.json({ orders });
}

/** { action: "shipped", id, carrier, tracking } */
export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; carrier?: string; tracking?: string };
  if (b.action !== "shipped") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  try {
    await markShipped(createServiceClient(), user.id, String(b.id || ""), String(b.carrier || ""), String(b.tracking || ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save that" }, { status: 400 });
  }
}

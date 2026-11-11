import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { MARKET_HINT } from "@/lib/marketplace";
import { isMarketType } from "@/lib/market-types";

/** "Tell me when it opens": { types: [...], email } (signed-in authors can leave out the email). One email when each type opens. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { types?: unknown; email?: string; company?: string };
  // A field people can't see; bots fill it in
  if (b.company) return NextResponse.json({ ok: true });
  const types = (Array.isArray(b.types) ? b.types : []).filter(isMarketType).slice(0, 7);
  if (!types.length) return NextResponse.json({ error: "Pick what you'd like to hire." }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = String(b.email || user?.email || "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter your email." }, { status: 400 });
  const { error } = await createServiceClient()
    .from("market_waitlist")
    .upsert(
      types.map((t) => ({ market_type: t, email, user_id: user?.email?.toLowerCase() === email ? user.id : null })),
      { onConflict: "market_type,email", ignoreDuplicates: true }
    );
  if (error) return NextResponse.json({ error: MARKET_HINT }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadOffers } from "@/lib/offers";

/** Founding and lifetime spots left, plus where this account stands. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createServiceClient();
  const offers = await loadOffers(admin);
  if (!offers) return NextResponse.json({ offers: null });
  const { data: bal } = user ? await admin.from("credit_balances").select("*").eq("user_id", user.id).maybeSingle() : { data: null };
  return NextResponse.json({
    offers,
    me: user
      ? {
          foundingMember: Boolean(bal?.founding_member),
          lifetimeTier: (bal?.lifetime_tier as string | null) || null,
          subscriptionTier: (bal?.subscription_tier as string | null) || "free",
        }
      : null,
  });
}

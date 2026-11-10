import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { purchasesFor } from "@/lib/direct-sales";

/** Ebooks this reader bought, including ones bought with their email before they had an account. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ purchases: await purchasesFor(createServiceClient(), user.id, user.email || null) });
  } catch {
    return NextResponse.json({ purchases: [] });
  }
}

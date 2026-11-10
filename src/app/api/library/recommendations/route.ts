import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { recommendationsFor } from "@/lib/reader-recs";

export const maxDuration = 30;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const recs = await recommendationsFor(createServiceClient(), user.id);
    return NextResponse.json(recs);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load recommendations" }, { status: 500 });
  }
}

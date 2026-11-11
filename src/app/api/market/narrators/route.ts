import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { directoryPros, typeStatuses } from "@/lib/marketplace";

/** Narrators an author can invite straight from the directory (once narrators are open). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const open = (await typeStatuses(admin).catch(() => null))?.find((t) => t.id === "narration")?.state === "open";
  if (!open) return NextResponse.json({ narrators: [] });
  const list = await directoryPros(admin, "narration").catch(() => []);
  return NextResponse.json({
    narrators: list.filter((p) => p.userId !== user.id).map((p) => ({ userId: p.userId, name: p.name, headline: p.headline, rateNote: p.rateNote, founding: p.founding })),
  });
}

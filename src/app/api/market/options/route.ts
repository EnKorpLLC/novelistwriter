import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { directoryPros, typeStatuses } from "@/lib/marketplace";
import { isMarketType } from "@/lib/market-types";

/** For the request form: which types are open, the author's books, and (with ?type=) that type's pros. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const type = new URL(req.url).searchParams.get("type");
  const [types, { data: books }] = await Promise.all([typeStatuses(admin), admin.from("projects").select("id, title").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100)]);
  const open = (types || []).find((t) => t.id === type)?.state === "open";
  return NextResponse.json({
    types: types || [],
    books: (books || []).map((b) => ({ id: b.id as string, title: (b.title as string) || "Untitled" })),
    pros: isMarketType(type) && open ? (await directoryPros(admin, type)).filter((p) => p.userId !== user.id).map((p) => ({ userId: p.userId, name: p.name, headline: p.headline, rateNote: p.rateNote, founding: p.founding })) : [],
  });
}

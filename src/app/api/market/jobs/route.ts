import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { JOBS_HINT, createRequest, type RequestInput } from "@/lib/market-jobs";
import { marketType } from "@/lib/market-types";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** My jobs: the ones I hired for, and the ones I'm doing. */
export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const [{ data: hiring, error }, { data: working }] = await Promise.all([
    admin.from("market_jobs").select("id, title, market_type, status, pro_id, invite_email, created_at, updated_at").eq("author_id", user.id).order("updated_at", { ascending: false }).limit(200),
    admin.from("market_jobs").select("id, title, market_type, status, author_id, created_at, updated_at").eq("pro_id", user.id).order("updated_at", { ascending: false }).limit(200),
  ]);
  if (error) return NextResponse.json({ migrationNeeded: true, error: JOBS_HINT, hiring: [], working: [] });
  const ids = [...new Set([...(hiring || []).map((j) => j.pro_id), ...(working || []).map((j) => j.author_id)].filter(Boolean))] as string[];
  const [{ data: pros }, { data: people }] = await Promise.all([
    ids.length ? admin.from("pro_profiles").select("user_id, name").in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string; name: string }[] }),
    ids.length ? admin.from("profiles").select("id, display_name").in("id", ids) : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
  ]);
  const name = (id: string | null) => (id && ((pros || []).find((p) => p.user_id === id)?.name || (people || []).find((p) => p.id === id)?.display_name)) || "";
  const shape = (j: Record<string, unknown>, other: string) => ({
    id: j.id as string,
    title: j.title as string,
    type: marketType(j.market_type as string)?.label || (j.market_type as string),
    status: j.status as string,
    other,
    updatedAt: j.updated_at as string,
  });
  return NextResponse.json({
    hiring: (hiring || []).map((j) => shape(j, name(j.pro_id as string | null) || (j.invite_email as string) || "")),
    working: (working || []).map((j) => shape(j, name(j.author_id as string) || "An author")),
  });
}

/** A new request: { type, projectId?, title, brief, deadline?, budgetNote?, proIds? | inviteEmail? } */
export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as RequestInput;
  try {
    const ids = await createRequest(createServiceClient(), { id: user.id, email: user.email || null }, b);
    return NextResponse.json({ ok: true, ids });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't send the request" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SALES_MIGRATION_HINT, saleReadiness } from "@/lib/direct-sales";
import { normalizeDirectSale } from "@/lib/direct-sale-rules";

async function owner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("projects").select("id, user_id, published, direct_sale").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return data;
}

/** This book's direct-sale settings and whether it can be bought right now. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await owner(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ready = await saleReadiness(createServiceClient(), project);
  return NextResponse.json({ sale: normalizeDirectSale(project.direct_sale), live: ready.ok, reason: ready.ok ? null : ready.reason });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await owner(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sale = normalizeDirectSale(await req.json().catch(() => ({})));
  const admin = createServiceClient();
  const { error } = await admin.from("projects").update({ direct_sale: sale }).eq("id", id);
  if (error) return NextResponse.json({ error: SALES_MIGRATION_HINT }, { status: 500 });
  const ready = await saleReadiness(admin, { ...project, direct_sale: sale });
  return NextResponse.json({ sale, live: ready.ok, reason: ready.ok ? null : ready.reason });
}

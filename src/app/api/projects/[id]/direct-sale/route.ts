import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PREORDER_MIGRATION_HINT, SALES_MIGRATION_HINT, saleReadiness } from "@/lib/direct-sales";
import { normalizeDirectSale, preorderProblem } from "@/lib/direct-sale-rules";
import { preordersReady, waitingPreorders } from "@/lib/preorders";

type Project = { id: string; user_id: string; published: boolean | null; direct_sale: unknown; release_date: string | null };

async function owner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("projects").select("id, user_id, published, direct_sale, release_date").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return data as Project | null;
}

/** Whether it's on sale (or open for pre-orders), and how many pre-orders are waiting. */
async function status(admin: SupabaseClient, project: Project) {
  const sale = normalizeDirectSale(project.direct_sale);
  const ready = await saleReadiness(admin, project, { preorder: true });
  const waiting = await waitingPreorders(admin, project.id);
  return {
    sale,
    live: ready.ok,
    reason: ready.ok ? null : ready.reason,
    preorder: {
      open: ready.ok && ready.preorder,
      problem: project.published ? null : preorderProblem(project.release_date),
      releaseDate: project.release_date,
      waiting: waiting?.length || 0,
    },
    published: Boolean(project.published),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await owner(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await status(createServiceClient(), project));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await owner(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sale = normalizeDirectSale(await req.json().catch(() => ({})));
  const admin = createServiceClient();
  if (sale.preorder && !normalizeDirectSale(project.direct_sale).preorder && !(await preordersReady(admin))) {
    return NextResponse.json({ error: PREORDER_MIGRATION_HINT }, { status: 500 });
  }
  const { error } = await admin.from("projects").update({ direct_sale: sale }).eq("id", id);
  if (error) return NextResponse.json({ error: SALES_MIGRATION_HINT }, { status: 500 });
  return NextResponse.json(await status(admin, { ...project, direct_sale: sale }));
}

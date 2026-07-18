import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { order } = (await req.json()) as { order: string[] };
  if (!Array.isArray(order)) {
    return NextResponse.json({ error: "order required" }, { status: 400 });
  }

  await Promise.all(
    order.map((chapterId, sort_order) =>
      supabase
        .from("chapters")
        .update({ sort_order })
        .eq("id", chapterId)
        .eq("project_id", projectId)
        .eq("user_id", user.id)
    )
  );

  return NextResponse.json({ ok: true });
}

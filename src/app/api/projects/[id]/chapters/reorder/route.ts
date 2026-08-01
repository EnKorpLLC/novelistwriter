import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyChapterNumber } from "@/lib/novelist2-docx";

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

  const { data: existing, error: loadError } = await supabase
    .from("chapters")
    .select("id, title")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .in("id", order);

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }

  const titleById = new Map((existing || []).map((c) => [c.id, c.title as string]));

  const updated = order.map((chapterId, sort_order) => {
    const prevTitle = titleById.get(chapterId) ?? `Chapter ${sort_order + 1}`;
    return {
      id: chapterId,
      sort_order,
      title: applyChapterNumber(prevTitle, sort_order + 1),
    };
  });

  await Promise.all(
    updated.map(({ id: chapterId, sort_order, title }) =>
      supabase
        .from("chapters")
        .update({ sort_order, title })
        .eq("id", chapterId)
        .eq("project_id", projectId)
        .eq("user_id", user.id)
    )
  );

  return NextResponse.json({ ok: true, chapters: updated });
}

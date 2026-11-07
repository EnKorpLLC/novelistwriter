import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { buildBook } from "@/lib/book/model";
import { getStyle } from "@/lib/book/styles";
import { buildStyledEpub } from "@/lib/book/epub";
import { loadBoxSetInput, type BoxSetRow } from "@/lib/book/box-set";
import { loadCover } from "@/lib/book/load";

export const maxDuration = 120;

/** Download a box set as one styled ebook (Studio). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasStudio(user.id))) {
    return NextResponse.json({ error: "Box sets are part of Studio. Upgrade on the Billing page.", code: "studio_required" }, { status: 403 });
  }
  const { data: set } = await supabase.from("box_sets").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!set.project_ids?.length) return NextResponse.json({ error: "Add at least one book first." }, { status: 400 });

  const input = await loadBoxSetInput(createServiceClient(), set as BoxSetRow);
  const style = getStyle(input.format.style);
  const book = buildBook({ ...input, styleHeadingFormat: style.headingFormat });
  const cover = await loadCover(supabase, { cover_path: set.cover_path });
  const buf = await buildStyledEpub({ book, style, identifier: `urn:uuid:${set.id}`, cover, recordUrl: null });
  const safeName = (set.title || "box set").replace(/[^\w\- ]+/g, "").trim() || "box set";
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/epub+zip", "Content-Disposition": `attachment; filename="${safeName}.epub"` },
  });
}

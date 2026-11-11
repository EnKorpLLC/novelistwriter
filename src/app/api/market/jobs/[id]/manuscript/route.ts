import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { exportEditingDocx } from "@/lib/export";
import { jobFor, milestonesOf } from "@/lib/market-jobs";
import { marketType } from "@/lib/market-types";

export const maxDuration = 60;

/** The book as a Word file for the hired editor, once the first milestone is paid. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const found = await jobFor(admin, id, user.id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { job } = found;
  if (marketType(job.market_type)?.group !== "editing" || !job.project_id) return NextResponse.json({ error: "This job isn't tied to a book." }, { status: 400 });
  const paid = (await milestonesOf(admin, job.id)).some((m) => m.status !== "unpaid" && m.status !== "cancelled");
  if (!paid) return NextResponse.json({ error: "The manuscript opens once the first milestone is paid." }, { status: 403 });
  const [{ data: project }, { data: chapters }, { data: pro }] = await Promise.all([
    admin.from("projects").select("title").eq("id", job.project_id).maybeSingle(),
    admin.from("chapters").select("*").eq("project_id", job.project_id).order("sort_order"),
    admin.from("pro_profiles").select("name").eq("user_id", job.pro_id || "").maybeSingle(),
  ]);
  const title = (project?.title as string) || "Manuscript";
  const buf = await exportEditingDocx({
    title,
    note: `Prepared for ${pro?.name || "the editor"} on ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Edit with Track Changes on and leave each chapter's heading as it is, so your changes can be reviewed paragraph by paragraph. Return this file as your delivery. Please don't share it.`,
    chapters: chapters || [],
  });
  const safe = title.replace(/[^\w\- ]+/g, "").trim() || "manuscript";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safe} (for editing).docx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

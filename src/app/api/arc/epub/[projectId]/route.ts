import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isArcWindowOpen } from "@/lib/arc";
import { escapeXml, buildBook } from "@/lib/book/model";
import { normalizeDetails, normalizeFormat } from "@/lib/book/format";
import { getStyle } from "@/lib/book/styles";
import { buildStyledEpub } from "@/lib/book/epub";
import { loadCover } from "@/lib/book/load";
import { markParagraphs, traceCode } from "@/lib/copy-guard";

export const maxDuration = 120;

/**
 * L7: an ARC reader's own copy for their e-reader. Built on request (nothing stored) and marked with
 * their name and email, plus their hidden code in every paragraph, so a shared file traces back to them.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to download your copy." }, { status: 401 });

  const admin = createServiceClient();
  const { data: project } = await admin.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project || !isArcWindowOpen(project)) return NextResponse.json({ error: "This ARC isn't open." }, { status: 403 });
  if (project.arc_downloads === false) return NextResponse.json({ error: "The author asked that this copy be read in the browser." }, { status: 403 });
  const email = String(user.email || "").toLowerCase();
  const { data: invites } = await admin
    .from("arc_invites")
    .select("id, display_name, email, reader_user_id, status")
    .eq("project_id", projectId)
    .eq("status", "active");
  const invite = (invites || []).find((i) => i.reader_user_id === user.id || String(i.email).toLowerCase() === email);
  if (!invite) return NextResponse.json({ error: "No ARC access" }, { status: 403 });

  const [{ data: chapters }, { data: matter }, { data: profile }, cover] = await Promise.all([
    admin.from("chapters").select("id, title, content_html, content_text, sort_order").eq("project_id", projectId).order("sort_order"),
    admin.from("matter_blocks").select("*").eq("project_id", projectId).order("sort_order"),
    admin.from("profiles").select("display_name").eq("id", project.user_id).maybeSingle(),
    loadCover(admin, project),
  ]);
  const reader = invite.display_name || email;
  const code = traceCode(invite.id);
  const notice = {
    matter_type: "front_custom",
    title: "Advance reader copy",
    content_html: `<p>This advance copy was made for ${escapeXml(reader)} (${escapeXml(invite.email)}). Please don't share or sell it.</p><p>It may differ from the final book. Thank you for reading early.</p>`,
    enabled: true,
    sort_order: -1,
  };
  const format = normalizeFormat(project.format_settings);
  const style = getStyle(format.style);
  const book = buildBook({
    title: project.title || "Untitled",
    subtitle: project.subtitle || "",
    author: profile?.display_name || "Author",
    details: normalizeDetails(project.book_details),
    format,
    styleHeadingFormat: style.headingFormat,
    chapters: (chapters || []).map((c) => ({ ...c, content_html: markParagraphs(c.content_html || "", code) })),
    // Review requests and newsletter pages belong in the final book, not the ARC
    matter: [notice, ...(matter || []).filter((m) => !["back_review_request", "back_newsletter"].includes(m.matter_type))],
  });
  const buf = await buildStyledEpub({ book, style, identifier: `urn:uuid:${project.id}-arc-${invite.id}`, cover, recordUrl: null });
  const safeName = (project.title || "book").replace(/[^\w\- ]+/g, "").trim() || "book";
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/epub+zip", "Content-Disposition": `attachment; filename="${safeName} (ARC).epub"`, "Cache-Control": "private, no-store" },
  });
}

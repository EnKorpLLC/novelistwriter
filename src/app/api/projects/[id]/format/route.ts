import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasPro } from "@/lib/credits";
import { normalizeDetails, normalizeFormat } from "@/lib/book/format";
import { buildBook } from "@/lib/book/model";
import { getStyle } from "@/lib/book/styles";
import { buildStyledEpub } from "@/lib/book/epub";
import { loadBookExtras, loadCover } from "@/lib/book/load";

export const maxDuration = 120;

async function owner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return project ? { supabase, user, project } : null;
}

/** What the Format tab needs beyond the project row: plan, author name, and generated-page links. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const [pro, { data: profile }, extras, { data: matter }] = await Promise.all([
    userHasPro(auth.user.id),
    admin.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
    loadBookExtras(admin, auth.project),
    auth.supabase.from("matter_blocks").select("*").eq("project_id", id).order("sort_order"),
  ]);
  // The workspace's project props are from page load, so tabs re-read the saved state from here
  return NextResponse.json({
    pro,
    authorName: profile?.display_name || "",
    extras,
    migrationNeeded: !("format_settings" in auth.project),
    formatSettings: auth.project.format_settings ?? null,
    bookDetails: auth.project.book_details ?? null,
    subtitle: auth.project.subtitle || "",
    matter: matter || [],
  });
}

/** Download the styled ebook (Pro). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userHasPro(auth.user.id))) {
    return NextResponse.json(
      { error: "Styled ebooks are part of Pro and Studio. Upgrade on the Billing page.", code: "pro_required" },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { includeChapterIds?: string[] };
  const project = auth.project;
  const admin = createServiceClient();
  const [{ data: chapters }, { data: matter }, { data: profile }, extras, cover] = await Promise.all([
    admin.from("chapters").select("id, title, content_html, content_text, sort_order").eq("project_id", id).order("sort_order"),
    admin.from("matter_blocks").select("*").eq("project_id", id).order("sort_order"),
    admin.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
    loadBookExtras(admin, project),
    loadCover(auth.supabase, project),
  ]);

  let selected = chapters || [];
  if (Array.isArray(body.includeChapterIds) && body.includeChapterIds.length) {
    const keep = new Set(body.includeChapterIds);
    selected = selected.filter((c) => keep.has(c.id));
  }
  if (!selected.length) return NextResponse.json({ error: "No chapters to include." }, { status: 400 });

  const format = normalizeFormat(project.format_settings);
  const style = getStyle(format.style);
  const book = buildBook({
    title: project.title || "Untitled",
    subtitle: project.subtitle || "",
    author: profile?.display_name || auth.user.email || "Author",
    details: normalizeDetails(project.book_details),
    format,
    styleHeadingFormat: style.headingFormat,
    chapters: selected,
    matter: matter || [],
    extras,
  });
  const buf = await buildStyledEpub({
    book,
    style,
    identifier: `urn:uuid:${project.id}`,
    cover,
    recordUrl: extras.recordUrl,
  });
  const safeName = (project.title || "book").replace(/[^\w\- ]+/g, "").trim() || "book";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${safeName}.epub"`,
    },
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import JSZip from "jszip";
import { userHasPro, userHasStudio } from "@/lib/credits";
import { STORES, isStoreId, storeOfLink, type StoreId } from "@/lib/book/stores";
import { normalizeBuyLinks } from "@/lib/arc";
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
  const [pro, studio, { data: profile }, extras, { data: matter }] = await Promise.all([
    userHasPro(auth.user.id),
    userHasStudio(auth.user.id),
    admin.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
    loadBookExtras(admin, auth.project),
    auth.supabase.from("matter_blocks").select("*").eq("project_id", id).order("sort_order"),
  ]);
  const linkedStores = normalizeBuyLinks(auth.project.buy_links)
    .filter((l) => !l.preorder)
    .map(storeOfLink)
    .filter((s): s is StoreId => !!s);
  // The workspace's project props are from page load, so tabs re-read the saved state from here
  return NextResponse.json({
    pro,
    studio,
    linkedStores,
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
  const body = (await req.json().catch(() => ({}))) as { includeChapterIds?: string[]; store?: string };
  const storeChoice = body.store === "all" ? "all" : isStoreId(body.store) ? body.store : null;
  if (storeChoice && !(await userHasStudio(auth.user.id))) {
    return NextResponse.json(
      { error: "Per-store ebooks are part of Studio. Upgrade on the Billing page.", code: "studio_required" },
      { status: 403 }
    );
  }
  const project = auth.project;
  const admin = createServiceClient();
  const [{ data: chapters }, { data: matter }, { data: profile }, cover] = await Promise.all([
    admin.from("chapters").select("id, title, content_html, content_text, sort_order").eq("project_id", id).order("sort_order"),
    admin.from("matter_blocks").select("*").eq("project_id", id).order("sort_order"),
    admin.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
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
  const build = async (store?: StoreId) => {
    const extras = await loadBookExtras(admin, project, { store });
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
    return buildStyledEpub({ book, style, identifier: `urn:uuid:${project.id}`, cover, recordUrl: extras.recordUrl });
  };

  const safeName = (project.title || "book").replace(/[^\w\- ]+/g, "").trim() || "book";
  if (storeChoice === "all") {
    const zip = new JSZip();
    for (const s of STORES) zip.file(`${safeName} - ${s.id}.epub`, await build(s.id));
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${safeName} - all stores.zip"` },
    });
  }
  const buf = await build(storeChoice || undefined);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${safeName}${storeChoice ? ` - ${storeChoice}` : ""}.epub"`,
    },
  });
}

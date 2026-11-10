import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { slugify } from "@/lib/handles";
import { CONTENT_MIGRATION_HINT, SITE_PAGES, contentPath, normalizeFaq, type ContentKind } from "@/lib/content";
import { STARTER_DRAFTS } from "@/lib/content-drafts";
import { computeReportStats } from "@/lib/report-stats";

export const maxDuration = 60;

const KINDS: ContentKind[] = ["guide", "report", "page"];

function hint(message: string) {
  return /content_pages/.test(message) ? CONTENT_MIGRATION_HINT : message;
}

function refresh(kind: ContentKind, slug: string) {
  revalidatePath(contentPath(kind, slug));
  revalidatePath(kind === "report" ? "/reports" : "/guides");
}

/** Every guide, report, and site page, drafts included. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.admin.from("content_pages").select("*").order("updated_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: hint(error.message) }, { status: 500 });
  const { data: me } = await auth.admin.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
  return NextResponse.json({
    pages: (data || []).map((p) => ({ ...p, faq: normalizeFaq(p.faq), path: contentPath(p.kind, p.slug) })),
    sitePages: SITE_PAGES,
    myName: me?.display_name || "",
    starterSlugs: STARTER_DRAFTS.map((d) => d.slug),
  });
}

/**
 *   { action: "import", authorName } loads the starter drafts that aren't in yet, as drafts;
 *   { action: "stats", id } fills a report with fresh anonymous totals;
 *   { kind, title } starts a new page.
 */
export async function POST(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === "import") {
    const authorName = String(body.authorName || "").trim().slice(0, 80);
    const { data: existing, error } = await admin.from("content_pages").select("kind, slug");
    if (error) return NextResponse.json({ error: hint(error.message) }, { status: 500 });
    const have = new Set((existing || []).map((e) => `${e.kind}:${e.slug}`));
    const rows = STARTER_DRAFTS.filter((d) => !have.has(`${d.kind}:${d.slug}`)).map((d) => ({ ...d, author_name: authorName, status: "draft" }));
    if (rows.length) {
      const { error: insErr } = await admin.from("content_pages").insert(rows);
      if (insErr) return NextResponse.json({ error: hint(insErr.message) }, { status: 500 });
    }
    return NextResponse.json({ added: rows.length });
  }

  if (body.action === "stats") {
    const { data: page } = await admin.from("content_pages").select("id, kind").eq("id", String(body.id || "")).maybeSingle();
    if (!page || page.kind !== "report") return NextResponse.json({ error: "Pick a report." }, { status: 400 });
    const data = await computeReportStats(admin, Math.min(365, Math.max(30, Number(body.days) || 90)));
    await admin.from("content_pages").update({ data, updated_at: new Date().toISOString() }).eq("id", page.id);
    return NextResponse.json({ data });
  }

  const kind = KINDS.includes(body.kind as ContentKind) ? (body.kind as ContentKind) : "guide";
  const title = String(body.title || "").trim().slice(0, 160);
  if (title.length < 4) return NextResponse.json({ error: "Give it a title." }, { status: 400 });
  const slug = kind === "page" ? String(body.slug || "") : slugify(String(body.slug || title), 80);
  if (kind === "page" && !(SITE_PAGES as readonly string[]).includes(slug)) return NextResponse.json({ error: "Site pages are fixed addresses; pick one from the list." }, { status: 400 });
  if (!slug) return NextResponse.json({ error: "Give it a title." }, { status: 400 });
  const { data, error } = await admin
    .from("content_pages")
    .insert({ kind, slug, title, author_name: String(body.authorName || "").slice(0, 80) })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? "Something already uses that address." : hint(error.message) }, { status: 400 });
  return NextResponse.json({ page: data });
}

/** Save edits, publish, or unpublish. */
export async function PATCH(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { data: page } = await admin.from("content_pages").select("*").eq("id", String(body.id || "")).maybeSingle();
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  for (const [k, max] of [
    ["title", 160],
    ["summary", 600],
    ["body", 60000],
    ["author_name", 80],
    ["related_path", 200],
    ["related_label", 80],
  ] as const) {
    if (typeof body[k] === "string") patch[k] = (body[k] as string).slice(0, max);
  }
  if (typeof body.related_path === "string" && body.related_path && !String(body.related_path).startsWith("/")) {
    return NextResponse.json({ error: "Related link must be a page on this site, starting with /" }, { status: 400 });
  }
  if ("faq" in body) patch.faq = normalizeFaq(body.faq);
  if (typeof body.slug === "string" && page.kind !== "page") {
    const slug = slugify(body.slug, 80);
    if (!slug) return NextResponse.json({ error: "The address can't be empty." }, { status: 400 });
    patch.slug = slug;
  }
  if (body.status === "published" || body.status === "draft") {
    patch.status = body.status;
    if (body.status === "published" && !page.published_at) patch.published_at = now;
  }
  const { data, error } = await admin.from("content_pages").update(patch).eq("id", page.id).select("*").single();
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? "Something already uses that address." : hint(error.message) }, { status: 400 });
  refresh(page.kind, page.slug);
  if (data.slug !== page.slug) refresh(data.kind, data.slug);
  return NextResponse.json({ page: { ...data, faq: normalizeFaq(data.faq), path: contentPath(data.kind, data.slug) } });
}

export async function DELETE(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id") || "";
  const { data: page } = await auth.admin.from("content_pages").select("kind, slug").eq("id", id).maybeSingle();
  await auth.admin.from("content_pages").delete().eq("id", id);
  if (page) refresh(page.kind, page.slug);
  return NextResponse.json({ ok: true });
}

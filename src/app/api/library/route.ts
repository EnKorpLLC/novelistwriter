import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseLibraryCsv, type Shelf } from "@/lib/library-import";
import { LIBRARY_MIGRATION_HINT, importBooks, loadLibrary, seriesForProject } from "@/lib/reader-library";

export const maxDuration = 60;

const SHELF_IDS: Shelf[] = ["want", "reading", "finished", "dnf"];

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Your shelves and series, or (with ?projectId) where one book sits on them. */
export async function GET(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (projectId) {
    const [{ data: entry, error }, series] = await Promise.all([
      admin.from("library_entries").select("id, shelf").eq("user_id", user.id).eq("project_id", projectId).maybeSingle(),
      seriesForProject(admin, projectId).catch(() => null),
    ]);
    if (error) return NextResponse.json({ migrationNeeded: true });
    const { data: follow } = series ? await admin.from("series_follows").select("series_key").eq("user_id", user.id).eq("series_key", series.key).maybeSingle() : { data: null };
    return NextResponse.json({ shelf: entry?.shelf || null, series: series ? { name: series.name, followed: Boolean(follow) } : null });
  }
  const lib = await loadLibrary(admin, user.id);
  if ("error" in lib) return NextResponse.json({ error: lib.error }, { status: 500 });
  return NextResponse.json(lib);
}

/**
 *   { action: "add", projectId, shelf } puts a book on a shelf (or moves it);
 *   { action: "import", csv } brings in a Goodreads or StoryGraph export;
 *   { action: "follow" | "unfollow", projectId } follows the book's series.
 */
export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const body = (await req.json().catch(() => ({}))) as { action?: string; projectId?: string; shelf?: string; csv?: string };

  if (body.action === "import") {
    const csv = String(body.csv || "");
    if (csv.length > 8_000_000) return NextResponse.json({ error: "That file is too big. Export just your shelves and try again." }, { status: 400 });
    const parsed = parseLibraryCsv(csv);
    if (!parsed.source) return NextResponse.json({ error: "That doesn't look like a Goodreads or StoryGraph export. Use the CSV file from their export page." }, { status: 400 });
    try {
      const result = await importBooks(admin, user.id, parsed.source, parsed.books);
      return NextResponse.json({ ok: true, source: parsed.source, ...result });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 500 });
    }
  }

  const projectId = String(body.projectId || "");
  if (body.action === "follow" || body.action === "unfollow") {
    const s = await seriesForProject(admin, projectId);
    if (!s) return NextResponse.json({ error: "This book isn't part of a series." }, { status: 400 });
    if (body.action === "unfollow") await admin.from("series_follows").delete().eq("user_id", user.id).eq("series_key", s.key);
    else {
      const { error } = await admin.from("series_follows").upsert({ user_id: user.id, series_key: s.key, author_user_id: s.authorUserId, series_name: s.name });
      if (error) return NextResponse.json({ error: /series_follows/.test(error.message) ? LIBRARY_MIGRATION_HINT : error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "add") {
    const shelf = SHELF_IDS.includes(body.shelf as Shelf) ? (body.shelf as Shelf) : "want";
    const { data: p } = await admin.from("projects").select("id, title").eq("id", projectId).maybeSingle();
    if (!p) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const now = new Date().toISOString();
    const { data: existing, error: findErr } = await admin.from("library_entries").select("id").eq("user_id", user.id).eq("project_id", projectId).maybeSingle();
    if (findErr) return NextResponse.json({ error: LIBRARY_MIGRATION_HINT }, { status: 500 });
    const patch = { shelf, updated_at: now, ...(shelf === "finished" ? { finished_on: now.slice(0, 10) } : {}) };
    const { error } = existing
      ? await admin.from("library_entries").update(patch).eq("id", existing.id)
      : await admin.from("library_entries").insert({ user_id: user.id, project_id: projectId, title: p.title || "", source: "here", ...patch });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, shelf });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/**
 * Bulk edits on your entries: { ids, shelf?, addShelf?, removeShelf?, rating? }.
 * Beta and advance-copy books ("auto:<projectId>") become regular entries the first time you edit them.
 */
export async function PATCH(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceClient();
  const body = (await req.json().catch(() => ({}))) as { ids?: string[]; shelf?: string; addShelf?: string; removeShelf?: string; rating?: number | null };
  const ids = (body.ids || []).slice(0, 2000);
  const now = new Date().toISOString();

  // Turn auto entries into real ones first
  const autos = ids.filter((id) => id.startsWith("auto:")).map((id) => id.slice(5));
  const real = ids.filter((id) => !id.startsWith("auto:"));
  if (autos.length) {
    const { data: projects } = await admin.from("projects").select("id, title").in("id", autos);
    const { data: made } = await admin
      .from("library_entries")
      .upsert((projects || []).map((p) => ({ user_id: user.id, project_id: p.id, title: p.title || "", source: "here", shelf: "reading" })), { onConflict: "user_id,project_id" })
      .select("id");
    real.push(...(made || []).map((m) => m.id as string));
  }
  if (!real.length) return NextResponse.json({ ok: true });

  const { data: rows } = await admin.from("library_entries").select("id, custom_shelves").eq("user_id", user.id).in("id", real);
  for (const r of rows || []) {
    const patch: Record<string, unknown> = { updated_at: now };
    if (SHELF_IDS.includes(body.shelf as Shelf)) {
      patch.shelf = body.shelf;
      if (body.shelf === "finished") patch.finished_on = now.slice(0, 10);
    }
    const custom = new Set<string>(r.custom_shelves || []);
    if (body.addShelf) custom.add(String(body.addShelf).trim().slice(0, 40));
    if (body.removeShelf) custom.delete(String(body.removeShelf));
    if (body.addShelf || body.removeShelf) patch.custom_shelves = [...custom].filter(Boolean);
    if (body.rating === null || (typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5)) patch.rating = body.rating;
    await admin.from("library_entries").update(patch).eq("id", r.id);
  }
  return NextResponse.json({ ok: true });
}

/** Remove entries: { ids }. */
export async function DELETE(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = (body.ids || []).filter((id) => !id.startsWith("auto:")).slice(0, 2000);
  if (ids.length) await createServiceClient().from("library_entries").delete().eq("user_id", user.id).in("id", ids);
  return NextResponse.json({ ok: true });
}

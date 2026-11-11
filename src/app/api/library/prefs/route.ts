import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { LIBRARY_MIGRATION_HINT } from "@/lib/reader-library";
import { normalizeFilters } from "@/lib/reader-recs";
import { normalizePrefs } from "@/lib/reading-prefs";

const PREFS_HINT = "Database needs an update. Run supabase/migration_reading_prefs.sql in the Supabase SQL editor.";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Shelf sharing, content filters, and reading preferences (genres and content warnings). */
export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createServiceClient().from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: LIBRARY_MIGRATION_HINT }, { status: 500 });
  return NextResponse.json({
    libraryPublic: Boolean(data?.library_public),
    contentFilters: normalizeFilters(data?.content_filters),
    readingPrefs: normalizePrefs(data?.reading_prefs),
    profilePublic: Boolean(data?.reader_profile_public),
    handle: data?.handle || null,
  });
}

export async function PATCH(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { libraryPublic?: boolean; contentFilters?: unknown; readingPrefs?: unknown };
  const admin = createServiceClient();
  const now = new Date().toISOString();
  if (body.readingPrefs !== undefined) {
    const readingPrefs = normalizePrefs(body.readingPrefs);
    const { error } = await admin.from("profiles").update({ reading_prefs: readingPrefs, updated_at: now }).eq("id", user.id);
    if (error) return NextResponse.json({ error: /reading_prefs/.test(error.message) ? PREFS_HINT : error.message }, { status: 500 });
    if (body.libraryPublic === undefined && body.contentFilters === undefined) return NextResponse.json({ ok: true, readingPrefs });
  }
  const patch: Record<string, unknown> = { updated_at: now };
  if (typeof body.libraryPublic === "boolean") patch.library_public = body.libraryPublic;
  if (body.contentFilters !== undefined) patch.content_filters = normalizeFilters(body.contentFilters);
  const { error } = await admin.from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ error: LIBRARY_MIGRATION_HINT }, { status: 500 });
  return NextResponse.json({ ok: true });
}

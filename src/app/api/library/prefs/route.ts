import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { LIBRARY_MIGRATION_HINT } from "@/lib/reader-library";
import { normalizeFilters } from "@/lib/reader-recs";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Shelf sharing and content filters. */
export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createServiceClient().from("profiles").select("library_public, content_filters, reader_profile_public, handle").eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: LIBRARY_MIGRATION_HINT }, { status: 500 });
  return NextResponse.json({
    libraryPublic: Boolean(data?.library_public),
    contentFilters: normalizeFilters(data?.content_filters),
    profilePublic: Boolean(data?.reader_profile_public),
    handle: data?.handle || null,
  });
}

export async function PATCH(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { libraryPublic?: boolean; contentFilters?: unknown };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.libraryPublic === "boolean") patch.library_public = body.libraryPublic;
  if (body.contentFilters !== undefined) patch.content_filters = normalizeFilters(body.contentFilters);
  const { error } = await createServiceClient().from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ error: LIBRARY_MIGRATION_HINT }, { status: 500 });
  return NextResponse.json({ ok: true });
}

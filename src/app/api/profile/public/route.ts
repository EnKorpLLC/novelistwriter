import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { normalizePublicLinks } from "@/lib/public-profile";
import { handleProblem } from "@/lib/handles";
import { ensureHandle } from "@/lib/public-site";
import { normalizeTheme } from "@/lib/site-themes";
import { coverPublicUrl } from "@/lib/cover";

const FIELDS = "display_name, public_links, handle, bio, avatar_path, banner_path, site_theme, featured_project_id, updated_at";

function migrationHint(message: string) {
  if (/public_links|handle|bio|avatar_path|banner_path|site_theme|featured_project_id/.test(message)) {
    return "Database needs an update. Run supabase/migration_launch_share.sql in the Supabase SQL editor.";
  }
  return message;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureHandle(createServiceClient(), user.id);
  const [{ data, error }, { data: projects }] = await Promise.all([
    supabase.from("profiles").select(FIELDS).eq("id", user.id).maybeSingle(),
    supabase.from("projects").select("id, title").eq("user_id", user.id).order("updated_at", { ascending: false }),
  ]);
  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  const version = data?.updated_at ? Date.parse(data.updated_at) : undefined;
  return NextResponse.json({
    userId: user.id,
    displayName: data?.display_name || "",
    links: normalizePublicLinks(data?.public_links),
    handle: data?.handle || "",
    bio: data?.bio || "",
    avatarUrl: coverPublicUrl(data?.avatar_path, version),
    bannerUrl: coverPublicUrl(data?.banner_path, version),
    theme: normalizeTheme(data?.site_theme),
    featuredProjectId: data?.featured_project_id || "",
    projects: projects || [],
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    links?: unknown;
    displayName?: string;
    handle?: string;
    bio?: string;
    theme?: string;
    featuredProjectId?: string | null;
  };
  const links = normalizePublicLinks(body.links);
  const patch: Record<string, unknown> = { public_links: links, updated_at: new Date().toISOString() };
  const name = String(body.displayName || "").trim().slice(0, 80);
  if (name) patch.display_name = name;
  if (typeof body.bio === "string") patch.bio = body.bio.trim().slice(0, 2000);
  if (typeof body.theme === "string") patch.site_theme = normalizeTheme(body.theme);

  if (typeof body.handle === "string") {
    const handle = body.handle.trim().toLowerCase();
    const problem = handleProblem(handle);
    if (problem) return NextResponse.json({ error: `Handle: ${problem}` }, { status: 400 });
    const admin = createServiceClient();
    const { data: taken } = await admin
      .from("profiles")
      .select("id")
      .ilike("handle", handle)
      .neq("id", user.id)
      .maybeSingle();
    if (taken) return NextResponse.json({ error: "That handle is taken." }, { status: 400 });
    patch.handle = handle;
  }

  if ("featuredProjectId" in body) {
    const id = String(body.featuredProjectId || "");
    if (id) {
      const { data: own } = await supabase.from("projects").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!own) return NextResponse.json({ error: "Featured book not found" }, { status: 400 });
    }
    patch.featured_project_id = id || null;
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true, links, handle: patch.handle });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isArcWindowOpen, normalizeBuyLinks, normalizeTropes } from "@/lib/arc";
import { normalizeWarningIds } from "@/lib/reading-prefs";
import { authorPath, bookPath, slugProblem, slugify } from "@/lib/handles";
import { pingIndexNow } from "@/lib/seo";
import { ensureHandle, ensureSlug } from "@/lib/public-site";
import { authorSitePublic, userHasStudio } from "@/lib/credits";
import { projectLockedMessage } from "@/lib/studio-access";
import { deliverPreorders, notifyPreorderDateMoved } from "@/lib/preorders";

const FIELDS =
  "id, user_id, title, slug, genre, blurb, tagline, release_date, launch_public, published, published_at, tropes, buy_links, beta_ready, arc_open, arc_deadline";

type ProjectRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  title: string;
  slug: string | null;
  published_at: string | null;
  tropes: unknown;
  buy_links: unknown;
};

function migrationHint(message: string) {
  if (/published|tropes|buy_links|arc_|slug|tagline|release_date|launch_public/.test(message)) {
    return "Database needs an update. Run supabase/migration_launch_share.sql in the Supabase SQL editor.";
  }
  return message;
}

async function load(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: project, error } = await supabase
    .from("projects")
    .select(FIELDS)
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: migrationHint(error.message) }, { status: 500 }) };
  if (!project) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { supabase, user, project: project as unknown as ProjectRow };
}

async function shape(project: ProjectRow) {
  const admin = createServiceClient();
  const [handle, slug, studio, sitePublic, { data: full }] = await Promise.all([
    ensureHandle(admin, project.user_id),
    ensureSlug(admin, project),
    userHasStudio(project.user_id),
    authorSitePublic(project.user_id),
    admin.from("projects").select("*").eq("id", project.id).maybeSingle(),
  ]);
  const arcLive = isArcWindowOpen(project as { arc_open?: boolean; arc_deadline?: string | null });
  const betaOpen = studio && Boolean(project.beta_ready);
  const launchPath = handle && slug ? bookPath(handle, slug) : null;
  const published = Boolean(project.published);
  return {
    title: project.title,
    genre: project.genre || "",
    hasBlurb: Boolean(String(project.blurb || "").trim()),
    tagline: String(project.tagline || ""),
    releaseDate: (project.release_date as string | null) || null,
    launchPublic: Boolean(project.launch_public),
    published,
    publishedAt: project.published_at || null,
    tropes: normalizeTropes(project.tropes),
    contentWarnings: normalizeWarningIds(full?.content_warnings),
    buyLinks: normalizeBuyLinks(project.buy_links),
    arcLive,
    betaOpen,
    handle,
    slug,
    launchPath,
    // Author sites and launch pages are public on Pro and up
    sitePublic,
    // Visitors can see the page when the site is public and any of these is true
    launchVisible: sitePublic && (published || Boolean(project.launch_public) || betaOpen || (studio && arcLive)),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await load(id);
  if ("error" in auth) return auth.error;
  return NextResponse.json(await shape(auth.project));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await load(id);
  if ("error" in auth) return auth.error;
  const { supabase, user, project } = auth;
  const lockMsg = await projectLockedMessage(supabase, id);
  if (lockMsg) return NextResponse.json({ error: lockMsg, code: "project_locked" }, { status: 423 });

  const body = (await req.json()) as {
    action?: string;
    tropes?: unknown;
    contentWarnings?: unknown;
    buyLinks?: unknown;
    tagline?: string;
    releaseDate?: string | null;
    launchPublic?: boolean;
    slug?: string;
  };
  const now = new Date().toISOString();
  const listing: Record<string, unknown> = {};
  if ("tropes" in body) listing.tropes = normalizeTropes(body.tropes);
  if ("buyLinks" in body) listing.buy_links = normalizeBuyLinks(body.buyLinks);
  if (typeof body.tagline === "string") listing.tagline = body.tagline.trim().slice(0, 160);
  if (typeof body.launchPublic === "boolean") listing.launch_public = body.launchPublic;
  if ("releaseDate" in body) {
    const d = String(body.releaseDate || "");
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: "Invalid release date" }, { status: 400 });
    }
    listing.release_date = d || null;
  }
  if (typeof body.slug === "string" && slugify(body.slug) !== (project.slug || "")) {
    const next = slugify(body.slug);
    const problem = slugProblem(next);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const { data: taken } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .ilike("slug", next)
      .neq("id", id)
      .maybeSingle();
    if (taken) return NextResponse.json({ error: "You already use that link for another book." }, { status: 400 });
    listing.slug = next;
  }

  // Saved on its own so the rest of the page still saves before migration_book_warnings.sql has run
  if ("contentWarnings" in body) {
    const { error } = await supabase.from("projects").update({ content_warnings: normalizeWarningIds(body.contentWarnings) }).eq("id", id).eq("user_id", user.id);
    if (error && normalizeWarningIds(body.contentWarnings).length) {
      return NextResponse.json({ error: "Database needs an update. Run supabase/migration_book_warnings.sql in the Supabase SQL editor." }, { status: 500 });
    }
  }

  let patch: Record<string, unknown>;
  if (body.action === "save") {
    patch = listing;
  } else if (body.action === "publish") {
    if (isArcWindowOpen(project as { arc_open?: boolean; arc_deadline?: string | null })) {
      return NextResponse.json(
        { error: "This book is still in its ARC window. End the ARC or wait for the deadline first." },
        { status: 400 }
      );
    }
    patch = { ...listing, published: true, published_at: project.published_at || now };
  } else if (body.action === "unpublish") {
    patch = { ...listing, published: false };
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ ...patch, updated_at: now })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(FIELDS)
    .single();
  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  // Direct pre-orders: delivered the moment the book is out; told when the date moves later
  const admin = createServiceClient();
  if (body.action === "publish") await deliverPreorders(admin, id).catch(() => 0);
  else if (!data.published && typeof listing.release_date === "string" && listing.release_date > String(project.release_date || "")) {
    await notifyPreorderDateMoved(admin, id, listing.release_date).catch(() => 0);
  }
  const shaped = await shape(data as unknown as ProjectRow);
  if (shaped.launchVisible && shaped.launchPath && shaped.handle) {
    await pingIndexNow([shaped.launchPath, authorPath(shaped.handle)]);
  }
  return NextResponse.json(shaped);
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isArcWindowOpen, normalizeBuyLinks, normalizeTropes } from "@/lib/arc";
import { appUrl } from "@/lib/stripe";

const FIELDS = "id, title, genre, blurb, published, published_at, tropes, buy_links, arc_open, arc_deadline";

function migrationHint(message: string) {
  if (message.includes("published") || message.includes("tropes") || message.includes("buy_links") || message.includes("arc_")) {
    return "Database needs an update. Run supabase/migration_platform_admin.sql in the Supabase SQL editor.";
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
  return { supabase, user, project };
}

function shape(project: Record<string, unknown>) {
  const arcLive = isArcWindowOpen(project as { arc_open?: boolean; arc_deadline?: string | null });
  return {
    title: project.title,
    genre: project.genre || "",
    hasBlurb: Boolean(String(project.blurb || "").trim()),
    published: Boolean(project.published),
    publishedAt: project.published_at || null,
    tropes: normalizeTropes(project.tropes),
    buyLinks: normalizeBuyLinks(project.buy_links),
    arcLive,
    publicUrl: appUrl(`/books/${project.id}`),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await load(id);
  if ("error" in auth) return auth.error;
  return NextResponse.json(shape(auth.project));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await load(id);
  if ("error" in auth) return auth.error;
  const { supabase, user, project } = auth;

  const body = (await req.json()) as { action?: string; tropes?: unknown; buyLinks?: unknown };
  const now = new Date().toISOString();
  let patch: Record<string, unknown>;

  if (body.action === "save") {
    patch = { tropes: normalizeTropes(body.tropes), buy_links: normalizeBuyLinks(body.buyLinks) };
  } else if (body.action === "publish") {
    if (isArcWindowOpen(project)) {
      return NextResponse.json(
        { error: "This book is still in its ARC window. End the ARC or wait for the deadline first." },
        { status: 400 }
      );
    }
    patch = {
      tropes: normalizeTropes(body.tropes ?? project.tropes),
      buy_links: normalizeBuyLinks(body.buyLinks ?? project.buy_links),
      published: true,
      published_at: project.published_at || now,
    };
  } else if (body.action === "unpublish") {
    patch = { published: false };
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
  return NextResponse.json(shape(data));
}

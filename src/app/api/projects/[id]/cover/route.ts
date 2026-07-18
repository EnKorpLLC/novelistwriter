import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, metadata")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Use JPG, PNG, or WebP" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Cover must be under 5MB" }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/${projectId}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage.from("covers").upload(path, buf, {
    contentType: file.type,
    upsert: true,
  });

  if (upErr) {
    return NextResponse.json(
      {
        error: `Upload failed: ${upErr.message}. Create a public Storage bucket named “covers” in Supabase.`,
      },
      { status: 500 }
    );
  }

  const { error: dbErr } = await supabase
    .from("projects")
    .update({ cover_path: path, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (dbErr) {
    // Column may not exist yet — store in metadata as fallback
    const prev = (project.metadata as Record<string, unknown> | null) || {};
    await supabase
      .from("projects")
      .update({
        metadata: { ...prev, cover_path: path },
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("user_id", user.id);
  }

  const { data: pub } = supabase.storage.from("covers").getPublicUrl(path);

  return NextResponse.json({ path, url: pub.publicUrl });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase
    .from("projects")
    .select("cover_path, metadata")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  const path =
    project?.cover_path ||
    (project?.metadata as { cover_path?: string } | null)?.cover_path;

  if (path) {
    await supabase.storage.from("covers").remove([path]);
  }

  const prev = (project?.metadata as Record<string, unknown> | null) || {};
  const { cover_path: _drop, ...restMeta } = prev;

  await supabase
    .from("projects")
    .update({
      cover_path: null,
      metadata: restMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}

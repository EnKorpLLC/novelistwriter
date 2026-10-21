import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { coverPublicUrl } from "@/lib/cover";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const KINDS = { avatar: "avatar_path", banner: "banner_path" } as const;
type Kind = keyof typeof KINDS;

function filePaths(userId: string, kind: Kind) {
  return ["jpg", "png", "webp"].map((ext) => `${userId}/profile-${kind}.${ext}`);
}

/** Author photo and banner, stored in the public covers bucket under the author's folder. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const kind = String(form.get("kind") || "") as Kind;
  const file = form.get("file") as File | null;
  if (!(kind in KINDS)) return NextResponse.json({ error: "kind must be avatar or banner" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Use JPG, PNG, or WebP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 5MB" }, { status: 400 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/profile-${kind}.${ext}`;
  await supabase.storage.from("covers").remove(filePaths(user.id, kind));
  const { error: upErr } = await supabase.storage
    .from("covers")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({ [KINDS[kind]]: path, updated_at: updatedAt })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url: coverPublicUrl(path, Date.parse(updatedAt)) });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kind = String(new URL(req.url).searchParams.get("kind") || "") as Kind;
  if (!(kind in KINDS)) return NextResponse.json({ error: "kind must be avatar or banner" }, { status: 400 });
  await supabase.storage.from("covers").remove(filePaths(user.id, kind));
  await supabase
    .from("profiles")
    .update({ [KINDS[kind]]: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  return NextResponse.json({ ok: true });
}

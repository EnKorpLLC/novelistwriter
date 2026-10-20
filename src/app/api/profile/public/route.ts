import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePublicLinks } from "@/lib/public-profile";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, public_links")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    const hint = error.message.includes("public_links")
      ? "Database needs an update. Run supabase/migration_platform_admin.sql in the Supabase SQL editor."
      : error.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  return NextResponse.json({
    userId: user.id,
    displayName: data?.display_name || "",
    links: normalizePublicLinks(data?.public_links),
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { links?: unknown; displayName?: string };
  const links = normalizePublicLinks(body.links);
  const patch: Record<string, unknown> = { public_links: links, updated_at: new Date().toISOString() };
  const name = String(body.displayName || "").trim().slice(0, 80);
  if (name) patch.display_name = name;

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, links });
}

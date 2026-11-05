import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureHandle } from "@/lib/public-site";
import { slugify } from "@/lib/handles";
import { publicReaderName } from "@/lib/beta-access";
import { READER_BADGE_RULES, readerBadgeStatsFor } from "@/lib/beta-social";

/** The signed-in reader's badges, badge stats, and whether their reader profile is public. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const [badgeMap, { data: profile, error }] = await Promise.all([
    readerBadgeStatsFor(admin, [{ userId: user.id, email: user.email }]),
    admin.from("profiles").select("display_name, handle, reader_profile_public").eq("id", user.id).maybeSingle(),
  ]);
  const mine = badgeMap.get(user.id);
  const isPublic = !error && Boolean(profile?.reader_profile_public);
  return NextResponse.json({
    badges: mine?.badges || [],
    stats: mine?.stats || null,
    rules: READER_BADGE_RULES,
    public: isPublic,
    url: isPublic && profile?.handle ? `/r/${profile.handle}` : null,
    hasDisplayName: publicReaderName(profile?.display_name, user.email, "") !== "",
    migrationNeeded: Boolean(error),
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { public?: boolean };
  if (typeof body.public !== "boolean") {
    return NextResponse.json({ error: "public required" }, { status: 400 });
  }
  const admin = createServiceClient();
  let handle: string | null = null;
  if (body.public) {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, handle, is_author")
      .eq("id", user.id)
      .maybeSingle();
    // The profile name and address come from the display name, never the email or its first half
    const fallback = "__none__";
    if (publicReaderName(profile?.display_name, user.email, fallback) === fallback) {
      return NextResponse.json(
        {
          error:
            "Add a display name in Settings first, one that isn't your email. It's the name shown on your public profile.",
        },
        { status: 400 }
      );
    }
    const emailSlug = slugify(String(user.email || "").split("@")[0], 30);
    if (profile?.handle && emailSlug && profile.handle.toLowerCase().startsWith(emailSlug) && !profile.is_author) {
      // An old address made from the email: replace it with one from the display name
      await admin.from("profiles").update({ handle: null }).eq("id", user.id);
    }
    handle = await ensureHandle(admin, user.id);
  }
  const { error } = await admin
    .from("profiles")
    .update({ reader_profile_public: body.public, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    const hint = error.message.includes("reader_profile_public")
      ? "Database needs an update. Run supabase/migration_reader_profile.sql in the Supabase SQL editor."
      : error.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  return NextResponse.json({ public: body.public, url: body.public && handle ? `/r/${handle}` : null });
}

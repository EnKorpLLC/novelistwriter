import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { LIBRARY_MIGRATION_HINT } from "@/lib/reader-library";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Only readers with a public profile can be followed. */
async function readerByHandle(handle: string) {
  const { data } = await createServiceClient().from("profiles").select("id, reader_profile_public").ilike("handle", handle).maybeSingle();
  return data?.reader_profile_public ? (data.id as string) : null;
}

/** ?handle= — are you following this reader? */
export async function GET(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ signedIn: false, following: false });
  const handle = new URL(req.url).searchParams.get("handle") || "";
  const id = await readerByHandle(handle);
  if (!id) return NextResponse.json({ signedIn: true, following: false, self: false });
  if (id === user.id) return NextResponse.json({ signedIn: true, following: false, self: true });
  const { data } = await createServiceClient().from("reader_follows").select("followed_user_id").eq("follower_user_id", user.id).eq("followed_user_id", id).maybeSingle();
  return NextResponse.json({ signedIn: true, following: Boolean(data), self: false });
}

/** { handle, action: "follow" | "unfollow" } */
export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { handle?: string; action?: string };
  const id = await readerByHandle(String(body.handle || ""));
  if (!id) return NextResponse.json({ error: "Reader not found" }, { status: 404 });
  if (id === user.id) return NextResponse.json({ error: "You can't follow yourself." }, { status: 400 });
  const admin = createServiceClient();
  if (body.action === "unfollow") {
    await admin.from("reader_follows").delete().eq("follower_user_id", user.id).eq("followed_user_id", id);
    return NextResponse.json({ ok: true, following: false });
  }
  const { error } = await admin.from("reader_follows").upsert({ follower_user_id: user.id, followed_user_id: id });
  if (error) return NextResponse.json({ error: LIBRARY_MIGRATION_HINT }, { status: 500 });
  return NextResponse.json({ ok: true, following: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { setSubscriberOptOut, upsertAuthorSubscriber } from "@/lib/audience";

/** Logged-in reader joins or leaves an author's email list from a book page. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { authorUserId?: string; subscribe?: boolean };
  const authorUserId = String(body.authorUserId || "");
  if (!authorUserId || authorUserId === user.id) {
    return NextResponse.json({ error: "authorUserId required" }, { status: 400 });
  }

  const admin = createServiceClient();
  if (body.subscribe) {
    if (!(await userHasStudio(authorUserId))) {
      return NextResponse.json({ error: "This author isn't collecting an email list." }, { status: 400 });
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    await upsertAuthorSubscriber(admin, {
      authorUserId,
      email: user.email,
      displayName: profile?.display_name,
      source: "opt_in",
    });
    return NextResponse.json({ ok: true, subscribed: true });
  }

  await setSubscriberOptOut(admin, { authorUserId, email: user.email });
  return NextResponse.json({ ok: true, subscribed: false });
}

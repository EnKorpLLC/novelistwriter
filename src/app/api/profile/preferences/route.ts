import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { disagree } = await req.json();
  const { data: profile } = await supabase
    .from("profiles")
    .select("critique_preferences")
    .eq("id", user.id)
    .maybeSingle();

  const prefs = (profile?.critique_preferences || {}) as { disagreements?: string[] };
  const disagreements = [...(prefs.disagreements || []), disagree].slice(-50);

  await supabase
    .from("profiles")
    .update({
      critique_preferences: { ...prefs, disagreements },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}

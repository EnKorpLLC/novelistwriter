import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

/** BYOK is a Studio subscription feature only. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const { data: bal } = await admin
    .from("credit_balances")
    .select("subscription_tier")
    .eq("user_id", user.id)
    .maybeSingle();

  if (bal?.subscription_tier !== "studio") {
    return NextResponse.json(
      {
        error: "Bring-your-own-key is included with Studio. Upgrade on the Billing page.",
        code: "studio_required",
      },
      { status: 403 }
    );
  }

  const { anthropic, openai } = await req.json();
  const patch: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof anthropic === "string") {
    const t = anthropic.trim().replace(/^['"]|['"]$/g, "");
    patch.byok_anthropic_key = t || null;
  }
  if (typeof openai === "string") {
    const t = openai.trim().replace(/^['"]|['"]$/g, "");
    patch.byok_openai_key = t || null;
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

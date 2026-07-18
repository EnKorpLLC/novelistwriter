import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { anthropic, openai } = await req.json();
  const patch: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof anthropic === "string") patch.byok_anthropic_key = anthropic || null;
  if (typeof openai === "string") patch.byok_openai_key = openai || null;

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

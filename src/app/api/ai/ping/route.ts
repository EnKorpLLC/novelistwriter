import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Tiny Anthropic connectivity check (admin/debug).
 * Uses platform key only — does not charge credits.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = process.env.ANTHROPIC_API_KEY || "";
  const key = raw.trim().replace(/^['"]|['"]$/g, "");
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  if (!key) {
    return NextResponse.json({
      ok: false,
      error: "ANTHROPIC_API_KEY is missing in this environment",
      keyPresent: false,
    });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 32,
        messages: [{ role: "user", content: 'Reply with JSON only: {"pong":true}' }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const text = await res.text();
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      model,
      keyPresent: true,
      keyLength: key.length,
      keyHadWhitespace: key.length !== raw.length,
      bodyPreview: text.slice(0, 240),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        keyPresent: true,
        keyLength: key.length,
        keyHadWhitespace: key.length !== raw.length,
        model,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

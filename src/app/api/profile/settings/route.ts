import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/notifications";

const FIELDS = "ai_disabled, ai_disabled_since, email_notifications, email_notifications_at, email_prompt_dismissed_at";

function migrationHint(message: string) {
  if (message.includes("ai_disabled") || message.includes("email_notifications") || message.includes("email_prompt")) {
    return "Database needs an update. Run supabase/migration_proof_trust.sql in the Supabase SQL editor.";
  }
  return message;
}

function shape(p: Record<string, unknown> | null) {
  return {
    aiDisabled: Boolean(p?.ai_disabled),
    aiDisabledSince: (p?.ai_disabled_since as string | null) || null,
    emailNotifications: Boolean(p?.email_notifications),
    emailPromptDismissed: Boolean(p?.email_prompt_dismissed_at),
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("profiles").select(FIELDS).eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  return NextResponse.json(shape(data));
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    aiDisabled?: boolean;
    emailNotifications?: boolean;
    dismissEmailPrompt?: boolean;
  };
  const { data: before } = await supabase.from("profiles").select(FIELDS).eq("id", user.id).maybeSingle();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  if (typeof body.aiDisabled === "boolean") {
    patch.ai_disabled = body.aiDisabled;
    // Turning AI back on resets the badge's "since" date
    patch.ai_disabled_since = body.aiDisabled ? before?.ai_disabled_since || now : null;
  }
  if (typeof body.emailNotifications === "boolean") {
    patch.email_notifications = body.emailNotifications;
    patch.email_notifications_at = now;
    patch.email_prompt_dismissed_at = before?.email_prompt_dismissed_at || now;
  }
  if (body.dismissEmailPrompt) patch.email_prompt_dismissed_at = now;

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select(FIELDS)
    .single();
  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });

  let welcomeSent = false;
  if (body.emailNotifications && !before?.email_notifications && user.email) {
    welcomeSent = (await sendWelcomeEmail(user.email)).ok;
  }
  return NextResponse.json({ ...shape(data), welcomeSent });
}

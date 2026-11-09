import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/notifications";

const FIELDS = "ai_disabled, ai_disabled_since, email_notifications, email_notifications_at, email_prompt_dismissed_at";
const DIGEST_FIELDS = "reader_digest, reader_digest_genres";

function migrationHint(message: string) {
  if (message.includes("reader_digest")) return "Database needs an update. Run supabase/migration_reader_digest.sql in the Supabase SQL editor.";
  if (message.includes("feature_on_socials")) return "Database needs an update. Run supabase/migration_social_engine.sql in the Supabase SQL editor.";
  if (message.includes("ai_disabled") || message.includes("email_notifications") || message.includes("email_prompt")) {
    return "Database needs an update. Run supabase/migration_proof_trust.sql in the Supabase SQL editor.";
  }
  return message;
}

function shape(p: Record<string, unknown> | null, extra: Record<string, unknown>) {
  return {
    aiDisabled: Boolean(p?.ai_disabled),
    aiDisabledSince: (p?.ai_disabled_since as string | null) || null,
    emailNotifications: Boolean(p?.email_notifications),
    emailPromptDismissed: Boolean(p?.email_prompt_dismissed_at),
    readerDigest: Boolean(extra.reader_digest),
    readerDigestGenres: String(extra.reader_digest_genres || ""),
    featureOnSocials: Boolean(extra.feature_on_socials),
  };
}

/** Columns from later migrations are read separately, so a missing one never breaks the rest of Settings */
async function readExtras(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const [{ data: digest }, { data: social }] = await Promise.all([
    supabase.from("profiles").select(DIGEST_FIELDS).eq("id", userId).maybeSingle(),
    supabase.from("profiles").select("feature_on_socials").eq("id", userId).maybeSingle(),
  ]);
  return { ...((digest as Record<string, unknown> | null) || {}), ...((social as Record<string, unknown> | null) || {}) };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("profiles").select(FIELDS).eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  return NextResponse.json(shape(data, await readExtras(supabase, user.id)));
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
    readerDigest?: boolean;
    readerDigestGenres?: string;
    featureOnSocials?: boolean;
  };
  const extraPatch: Record<string, unknown> = {};
  if (typeof body.readerDigest === "boolean") extraPatch.reader_digest = body.readerDigest;
  if (typeof body.readerDigestGenres === "string") extraPatch.reader_digest_genres = body.readerDigestGenres.slice(0, 200);
  if (typeof body.featureOnSocials === "boolean") extraPatch.feature_on_socials = body.featureOnSocials;
  if (Object.keys(extraPatch).length) {
    const { error: extraErr } = await supabase.from("profiles").update(extraPatch).eq("id", user.id);
    if (extraErr) return NextResponse.json({ error: migrationHint(extraErr.message) }, { status: 500 });
  }
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
  return NextResponse.json({ ...shape(data, await readExtras(supabase, user.id)), welcomeSent });
}

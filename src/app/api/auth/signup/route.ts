import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/notifications";

/**
 * Create an account without sending Supabase's signup confirmation email.
 * Client should follow with signInWithPassword to establish the session cookie.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    email?: string;
    password?: string;
    displayName?: string;
    role?: "author" | "beta_reader";
    emailNotifications?: boolean;
  };

  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");
  const displayName = String(body.displayName || "").trim();
  const role = body.role === "beta_reader" ? "beta_reader" : "author";

  if (!email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName || email.split("@")[0],
      signup_role: role,
    },
  });

  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return NextResponse.json(
        { error: "Account exists — log in with this email.", code: "already_registered" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // The profile row is created by the auth trigger, so it exists by now
  if (body.emailNotifications && data.user?.id) {
    const now = new Date().toISOString();
    const { error: consentErr } = await admin
      .from("profiles")
      .update({
        email_notifications: true,
        email_notifications_at: now,
        email_prompt_dismissed_at: now,
      })
      .eq("id", data.user.id);
    if (!consentErr) await sendWelcomeEmail(email);
  }

  return NextResponse.json({ ok: true, userId: data.user?.id || null });
}

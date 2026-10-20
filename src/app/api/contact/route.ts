import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { renderEmail, sendEmail } from "@/lib/email";
import { platformAdminEmail } from "@/lib/platform-admin";
import { appUrl } from "@/lib/stripe";

const MAX_PER_HOUR = 5;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
    company?: string;
  };

  // Honeypot field: real visitors never see it
  if (body.company) return NextResponse.json({ ok: true });

  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const subject = String(body.subject || "").trim().slice(0, 200);
  const message = String(body.message || "").trim().slice(0, 8000);
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Enter an email so we can reply." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  }

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id || null;
  } catch {
    /* guests are fine */
  }

  const admin = createServiceClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("platform_messages")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);
  if ((count || 0) >= MAX_PER_HOUR) {
    return NextResponse.json(
      { error: "You've sent several messages recently. Please wait a bit and try again." },
      { status: 429 }
    );
  }

  const { error } = await admin.from("platform_messages").insert({
    name,
    email,
    subject,
    body: message,
    user_id: userId,
  });
  if (error) {
    const hint = error.message.includes("platform_messages")
      ? "Database needs an update. Run supabase/migration_platform_admin.sql in the Supabase SQL editor."
      : error.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }

  const mail = renderEmail({
    heading: subject || "New Contact us message",
    paragraphs: [`From ${name || "(no name)"} <${email}>`, message],
    button: { label: "Open admin inbox", url: appUrl("/admin") },
  });
  await sendEmail({
    to: platformAdminEmail(),
    subject: `Contact us: ${subject || name || email}`,
    text: mail.text,
    html: mail.html,
    replyTo: email,
  });

  return NextResponse.json({ ok: true });
}

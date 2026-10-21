import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { upsertAuthorSubscriber } from "@/lib/audience";
import { renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/stripe";

const RESEND_AFTER_MS = 10 * 60 * 1000;

/** Anyone can join an author's list from a launch page or author site; guests confirm by email. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    authorUserId?: string;
    email?: string;
    name?: string;
    company?: string;
  };
  if (body.company) return NextResponse.json({ ok: true, status: "check_email" });

  const authorUserId = String(body.authorUserId || "");
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const name = String(body.name || "").trim().slice(0, 80) || null;
  if (!authorUserId || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const admin = createServiceClient();
  if (!(await userHasStudio(authorUserId))) {
    return NextResponse.json({ error: "This author isn't collecting an email list right now." }, { status: 400 });
  }

  // A signed-in reader joining with their own email needs no confirmation
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email && user.email.trim().toLowerCase() === email) {
    await upsertAuthorSubscriber(admin, { authorUserId, email, displayName: name, source: "opt_in" });
    return NextResponse.json({ ok: true, status: "subscribed" });
  }

  const { data: existing, error: lookupErr } = await admin
    .from("author_subscribers")
    .select("id, confirmed_at, unsubscribed_at, confirm_sent_at")
    .eq("author_user_id", authorUserId)
    .eq("email", email)
    .maybeSingle();
  if (lookupErr) {
    const hint = lookupErr.message.includes("confirm")
      ? "Database needs an update. Run supabase/migration_launch_share.sql in the Supabase SQL editor."
      : lookupErr.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  if (existing?.confirmed_at && !existing.unsubscribed_at) {
    return NextResponse.json({ ok: true, status: "already" });
  }
  if (existing?.confirm_sent_at && Date.now() - Date.parse(existing.confirm_sent_at) < RESEND_AFTER_MS) {
    return NextResponse.json({ ok: true, status: "check_email" });
  }

  const token = randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  const { error } = existing
    ? await admin
        .from("author_subscribers")
        .update({ confirm_token: token, confirm_sent_at: now, display_name: name, updated_at: now })
        .eq("id", existing.id)
    : await admin.from("author_subscribers").insert({
        author_user_id: authorUserId,
        email,
        display_name: name,
        sources: ["opt_in"],
        confirmed_at: null,
        confirm_token: token,
        confirm_sent_at: now,
      });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: author } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", authorUserId)
    .maybeSingle();
  const authorName = author?.display_name || "this author";
  const mail = renderEmail({
    heading: `Confirm you want to join ${authorName}'s list`,
    paragraphs: [
      `Someone entered this email to get updates from ${authorName} on Novelist Writer: new books, advance copies, and release news.`,
      "If that was you, confirm below. If not, ignore this email and nothing happens.",
    ],
    button: { label: "Yes, add me", url: appUrl(`/subscribe/confirm?token=${token}`) },
  });
  const sent = await sendEmail({
    to: email,
    subject: `Confirm: updates from ${authorName}`,
    text: mail.text,
    html: mail.html,
  });
  if (!sent.ok) {
    return NextResponse.json({ error: "We couldn't send the confirmation email. Try again later." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, status: "check_email" });
}

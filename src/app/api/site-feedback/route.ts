import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { renderEmail, sendEmail } from "@/lib/email";
import { platformAdminEmail } from "@/lib/platform-admin";
import { appUrl } from "@/lib/stripe";
import { FEEDBACK_BUCKET, FEEDBACK_KINDS, FEEDBACK_MAX_BYTES, FEEDBACK_MAX_FILES, feedbackLabel } from "@/lib/site-feedback";

const MAX_PER_HOUR = 10;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const HINT = "Database needs an update. Run supabase/migration_site_feedback.sql in the Supabase SQL editor.";

/** Feedback from a signed-in user: multipart with kind, message, page, and up to 4 screenshots. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to send feedback." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Couldn't read that" }, { status: 400 });
  const kind = String(form.get("kind") || "");
  const message = String(form.get("message") || "").trim().slice(0, 8000);
  const page = String(form.get("page") || "").slice(0, 300);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!FEEDBACK_KINDS.some((k) => k.id === kind)) return NextResponse.json({ error: "Pick what kind of feedback this is." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  if (files.length > FEEDBACK_MAX_FILES) return NextResponse.json({ error: `Attach up to ${FEEDBACK_MAX_FILES} screenshots.` }, { status: 400 });
  for (const f of files) {
    if (!IMAGE_TYPES[f.type]) return NextResponse.json({ error: "Screenshots must be PNG, JPG, WebP, or GIF." }, { status: 400 });
    if (f.size > FEEDBACK_MAX_BYTES) return NextResponse.json({ error: "Each screenshot must be under 5 MB." }, { status: 400 });
  }

  const admin = createServiceClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("platform_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count || 0) >= MAX_PER_HOUR) return NextResponse.json({ error: "You've sent a lot of feedback this hour. Thank you! Please try again a bit later." }, { status: 429 });

  const stamp = Date.now();
  const paths: string[] = [];
  for (const [i, f] of files.entries()) {
    const path = `${user.id}/${stamp}-${i + 1}.${IMAGE_TYPES[f.type]}`;
    const { error } = await admin.storage.from(FEEDBACK_BUCKET).upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type });
    if (error) return NextResponse.json({ error: /bucket/i.test(error.message) ? HINT : `Upload failed: ${error.message}` }, { status: 500 });
    paths.push(path);
  }

  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const label = feedbackLabel(kind)!;
  const { error } = await admin.from("platform_messages").insert({
    name: (profile?.display_name as string) || "",
    email: (user.email || "").toLowerCase(),
    subject: label,
    body: message,
    user_id: user.id,
    kind,
    page,
    attachments: paths,
  });
  if (error) {
    if (paths.length) await admin.storage.from(FEEDBACK_BUCKET).remove(paths);
    return NextResponse.json({ error: HINT }, { status: 500 });
  }

  const mail = renderEmail({
    heading: `Feedback: ${label}`,
    paragraphs: [`From ${profile?.display_name || "(no name)"} <${user.email}>${page ? ` on ${page}` : ""}`, message, paths.length ? `${paths.length} screenshot${paths.length === 1 ? "" : "s"} attached in the admin inbox.` : ""].filter(Boolean),
    button: { label: "Open admin inbox", url: appUrl("/admin?tab=messages") },
  });
  await sendEmail({ to: platformAdminEmail(), subject: `Feedback: ${label}`, text: mail.text, html: mail.html, replyTo: user.email || undefined }).catch(() => null);

  return NextResponse.json({ ok: true });
}

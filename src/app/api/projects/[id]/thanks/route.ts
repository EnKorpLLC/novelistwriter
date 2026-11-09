import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { renderEmail } from "@/lib/email";
import { emailConsentFor } from "@/lib/notifications";
import { enqueueEmails, processEmailQueue } from "@/lib/email-queue";
import { createNotification } from "@/lib/beta-social";
import { appUrl } from "@/lib/stripe";

async function owner(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: project } = await supabase.from("projects").select("id, title, user_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  return project ? { user, project } : null;
}

/** Which ARC and beta readers this author already thanked for this book. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data } = await createServiceClient().from("author_thanks").select("reader_email").eq("project_id", id).eq("kind", "reader");
  return NextResponse.json({ thanked: [...new Set((data || []).map((r) => String(r.reader_email || "").toLowerCase()).filter(Boolean))] });
}

/** L7: one-click thanks to an ARC reader who finished or posted a review. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { inviteId?: string; message?: string };
  const admin = createServiceClient();
  const { data: invite } = await admin.from("arc_invites").select("id, email, display_name, reader_user_id").eq("id", String(body.inviteId || "")).eq("project_id", id).maybeSingle();
  if (!invite) return NextResponse.json({ error: "Reader not found" }, { status: 404 });

  const { data: profile } = await admin.from("profiles").select("display_name, email").eq("id", auth.user.id).maybeSingle();
  const author = profile?.display_name || "The author";
  const title = auth.project.title || "the book";
  const message =
    String(body.message || "").trim().slice(0, 1000) ||
    `Thank you so much for reading ${title} early${invite.display_name ? `, ${invite.display_name}` : ""}. Your time and your review mean a lot.`;

  await admin.from("author_thanks").insert({
    project_id: id,
    author_user_id: auth.user.id,
    reader_user_id: invite.reader_user_id,
    reader_email: String(invite.email || "").toLowerCase(),
    kind: "reader",
    message,
  });
  const consent = await emailConsentFor(admin, { userId: invite.reader_user_id, email: invite.email });
  if (consent.userId) {
    await createNotification(admin, { userId: consent.userId, type: "author_thanks", title: `A thank-you from ${author}`, body: message, href: "/beta/dashboard", meta: { projectId: id } });
  }
  if (consent.optedIn) {
    const mail = renderEmail({ heading: `A thank-you from ${author}`, paragraphs: [message], button: { label: "Your reader dashboard", url: appUrl("/beta/dashboard") }, notification: true });
    await enqueueEmails(admin, [{ to: invite.email, subject: `A thank-you from ${author}`, html: mail.html, text: mail.text, replyTo: profile?.email, kind: "notification" }]);
    await processEmailQueue(admin, { timeBudgetMs: 10_000 });
  }
  return NextResponse.json({ ok: true, inApp: Boolean(consent.userId), emailed: consent.optedIn });
}

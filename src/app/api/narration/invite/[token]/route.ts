import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/stripe";
import { jobFromRow } from "@/lib/narration-access";

async function load(token: string) {
  const admin = createServiceClient();
  const { data, error } = await admin.from("narrator_jobs").select("*").eq("invite_token", token).maybeSingle();
  if (error || !data) return null;
  const [{ data: project }, { data: author }] = await Promise.all([
    admin.from("projects").select("title").eq("id", data.project_id).maybeSingle(),
    admin.from("profiles").select("display_name, email").eq("id", data.author_id).maybeSingle(),
  ]);
  return { admin, row: data, job: jobFromRow(data), book: (project?.title as string) || "Untitled", author: (author?.display_name as string) || "The author", authorEmail: (author?.email as string) || null };
}

/** What the invite link shows: the book, the author, and the agreement. The script itself only opens after accepting. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const x = await load(token);
  if (!x) return NextResponse.json({ error: "This invite link isn't valid. Ask the author to send it again." }, { status: 404 });
  const { count } = await x.admin.from("profiles").select("id", { count: "exact", head: true }).ilike("email", x.job.inviteEmail);
  return NextResponse.json({
    book: x.book,
    author: x.author,
    email: x.job.inviteEmail,
    narratorName: x.job.narratorName,
    status: x.job.status,
    terms: x.job.terms,
    termsVersion: x.job.termsVersion,
    message: x.job.message,
    jobId: x.job.id,
    hasAccount: (count || 0) > 0,
  });
}

/** { action: "accept", termsVersion, name? } or { action: "decline", reason? }, signed in as the invited email. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const x = await load(token);
  if (!x) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if ((user.email || "").toLowerCase() !== x.job.inviteEmail.toLowerCase()) {
    return NextResponse.json({ error: `This invite is for ${x.job.inviteEmail}. Sign in with that email to answer it.` }, { status: 403 });
  }
  if (x.job.status !== "invited") return NextResponse.json({ error: x.job.status === "active" ? "You've already accepted this job." : "This invite is closed." }, { status: 409 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (b.action === "accept") {
    // The author may have changed the terms while this page was open
    if (Number(b.termsVersion) !== x.job.termsVersion) return NextResponse.json({ error: "The author just updated the terms. Reload to read the new version." }, { status: 409 });
    const name = String(b.name || "").trim().slice(0, 120) || x.job.narratorName;
    const { error } = await x.admin
      .from("narrator_jobs")
      .update({ status: "active", narrator_id: user.id, narrator_name: name, narrator_accepted_at: now, updated_at: now })
      .eq("id", x.job.id)
      .eq("status", "invited");
    if (error) return NextResponse.json({ error: "Couldn't accept. Try again." }, { status: 500 });
    await x.admin.from("profiles").update({ is_narrator: true }).eq("id", user.id);
    if (x.authorEmail) {
      const mail = renderEmail({
        heading: `${name || "Your narrator"} accepted "${x.book}"`,
        paragraphs: [
          `${name || x.job.inviteEmail} accepted the narration agreement for "${x.book}". They can now open the script and the recording studio for this book (and only this book).`,
          x.job.terms.checkpoint ? "First up: they'll record about 15 minutes for you to approve before full production." : "",
        ].filter(Boolean),
        button: { label: "Open the Audio tab", url: appUrl(`/project/${x.job.projectId}?tab=audio`) },
      });
      await sendEmail({ to: x.authorEmail, subject: `Narrator accepted: "${x.book}"`, text: mail.text, html: mail.html }).catch(() => null);
    }
    return NextResponse.json({ ok: true, jobId: x.job.id });
  }

  if (b.action === "decline") {
    const reason = String(b.reason || "").trim().slice(0, 1000);
    await x.admin.from("narrator_jobs").update({ status: "declined", declined_reason: reason || null, narrator_id: user.id, updated_at: now }).eq("id", x.job.id);
    if (x.authorEmail) {
      const mail = renderEmail({
        heading: `Narration invite declined: "${x.book}"`,
        paragraphs: [`${x.job.narratorName || x.job.inviteEmail} declined the invite to narrate "${x.book}".`, reason ? `Their note: "${reason}"` : ""].filter(Boolean),
        button: { label: "Open the Audio tab", url: appUrl(`/project/${x.job.projectId}?tab=audio`) },
      });
      await sendEmail({ to: x.authorEmail, subject: `Narration invite declined: "${x.book}"`, text: mail.text, html: mail.html }).catch(() => null);
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

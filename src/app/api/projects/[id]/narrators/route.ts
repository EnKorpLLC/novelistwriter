import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/stripe";
import { jobFromRow } from "@/lib/narration-access";
import { dollars, estimateCost, normalizeTerms, termsProblem } from "@/lib/narration";

const HINT = "Narrator invites need a database update. Run supabase/migration_narrators.sql in the Supabase SQL editor.";

async function ownerProject(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("projects").select("id, title").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return data ? { user, title: (data.title as string) || "Untitled" } : null;
}

async function sendInvite(job: { invite_email: string; invite_token: string; narrator_name: string; message: string; terms: unknown }, book: string, author: string) {
  const t = normalizeTerms(job.terms);
  const pay = t.pay === "per_finished_hour" ? `${dollars(t.rateCents)} per finished hour (about ${t.estimatedHours} hours)` : `a ${t.sharePct}% royalty share of sales on Novelist Writer for ${t.shareYears} years`;
  const mail = renderEmail({
    heading: `${author} would like you to narrate "${book}"`,
    paragraphs: [
      `Hi${job.narrator_name ? ` ${job.narrator_name}` : ""}, ${author} is producing an audiobook of "${book}" on Novelist Writer and has invited you to narrate it, for ${pay}.`,
      job.message ? `Their note: "${job.message}"` : "",
      "Open the invite to read the full agreement. If you accept, you'll get a free narrator account with the script and a recording studio in your browser. Your recordings stay on your own computer.",
    ].filter(Boolean),
    button: { label: "See the invite", url: appUrl(`/narrate/${job.invite_token}`) },
  });
  await sendEmail({ to: job.invite_email, subject: `Narration invite: "${book}"`, text: mail.text, html: mail.html }).catch(() => null);
}

/** The book's narrator jobs, newest first. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownerProject(id);
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const { data, error } = await admin.from("narrator_jobs").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ migrationNeeded: true, error: HINT, jobs: [] });
  return NextResponse.json({ jobs: (data || []).map(jobFromRow), studio: await userHasStudio(own.user.id) });
}

/**
 *   { action: "invite", email, name, terms, message }
 *   { action: "update_terms", id, terms }   (before the narrator accepts; they see the new version)
 *   { action: "resend", id }
 *   { action: "cancel", id }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownerProject(id);
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", own.user.id).maybeSingle();
  const author = (profile?.display_name as string) || "An author";

  if (b.action === "invite") {
    if (!(await userHasStudio(own.user.id))) return NextResponse.json({ error: "Hiring a narrator is part of Studio." }, { status: 402 });
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter the narrator's email." }, { status: 400 });
    if (email === (own.user.email || "").toLowerCase()) return NextResponse.json({ error: "Narrating it yourself? Just use the studio below; no invite needed." }, { status: 400 });
    const terms = normalizeTerms(b.terms);
    const problem = termsProblem(terms);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const row = {
      project_id: id,
      author_id: own.user.id,
      invite_email: email,
      invite_token: randomBytes(24).toString("base64url"),
      narrator_name: String(b.name || "").trim().slice(0, 120),
      message: String(b.message || "").trim().slice(0, 1000),
      terms,
      author_accepted_at: new Date().toISOString(),
    };
    const { error } = await admin.from("narrator_jobs").insert(row);
    if (error) {
      if (/narrator_jobs_one_open|duplicate/i.test(error.message)) return NextResponse.json({ error: "This book already has an open narrator invite or job. Cancel it first." }, { status: 409 });
      return NextResponse.json({ error: HINT }, { status: 500 });
    }
    await sendInvite(row, own.title, author);
    return NextResponse.json({ ok: true });
  }

  const { data: job } = await admin.from("narrator_jobs").select("*").eq("id", String(b.id || "")).eq("project_id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  if (b.action === "update_terms") {
    if (job.status !== "invited") return NextResponse.json({ error: "The narrator has already accepted. Changes to an accepted agreement come in a later update; cancel and re-invite if you must." }, { status: 409 });
    const terms = normalizeTerms(b.terms);
    const problem = termsProblem(terms);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    await admin
      .from("narrator_jobs")
      .update({ terms, terms_version: (job.terms_version || 1) + 1, author_accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", job.id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "resend") {
    if (job.status !== "invited") return NextResponse.json({ error: "Only open invites can be resent." }, { status: 409 });
    await sendInvite(job, own.title, author);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "cancel") {
    if (!["invited", "active"].includes(job.status)) return NextResponse.json({ error: "This job is already closed." }, { status: 409 });
    await admin.from("narrator_jobs").update({ status: "cancelled", cancelled_by: own.user.id, updated_at: new Date().toISOString() }).eq("id", job.id);
    if (job.status === "active" && job.narrator_id) {
      const { data: n } = await admin.from("profiles").select("email").eq("id", job.narrator_id).maybeSingle();
      if (n?.email) {
        const cost = estimateCost(normalizeTerms(job.terms));
        const mail = renderEmail({
          heading: `"${own.title}" narration was cancelled`,
          paragraphs: [
            `${author} cancelled the narration job for "${own.title}".`,
            cost.fee ? "Under the agreement, work finished and approved before cancelling is paid, plus the cancellation fee once past the checkpoint. Payments arrive in an upcoming update; we'll email you about anything owed." : "",
            "Your recordings are still on your computer.",
          ].filter(Boolean),
          button: { label: "Open your narrator dashboard", url: appUrl("/narrator") },
        });
        await sendEmail({ to: n.email as string, subject: `Narration cancelled: "${own.title}"`, text: mail.text, html: mail.html }).catch(() => null);
      }
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { renderEmail } from "@/lib/email";
import { optedInUserIds } from "@/lib/notifications";
import { enqueueEmails, processEmailQueue } from "@/lib/email-queue";
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

/** The author's launch team: who joined and which tasks they've done. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const { data: rows } = await admin.from("launch_team").select("user_id, joined_at, tasks").eq("project_id", id).order("joined_at");
  const ids = (rows || []).map((r) => r.user_id);
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const names = new Map((profiles || []).map((p) => [p.id, p.display_name as string | null]));
  const { data: lastThanks } = await admin
    .from("author_thanks")
    .select("created_at")
    .eq("project_id", id)
    .eq("kind", "team")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({
    members: (rows || []).map((r) => ({ name: names.get(r.user_id) || "A reader", joinedAt: r.joined_at, tasks: Object.keys(r.tasks || {}) })),
    lastThankedAt: lastThanks?.created_at || null,
  });
}

/** Thank the whole team: in the app for everyone, by email for those who allow it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await owner(id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userHasStudio(auth.user.id))) return NextResponse.json({ error: "Launch teams are part of Studio.", code: "studio_required" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = String(body.message || "").trim().slice(0, 1000) || "Thank you for helping launch this book. It means more than I can say.";
  const admin = createServiceClient();
  const [{ data: rows }, { data: profile }] = await Promise.all([
    admin.from("launch_team").select("user_id").eq("project_id", id),
    admin.from("profiles").select("display_name, email").eq("id", auth.user.id).maybeSingle(),
  ]);
  const ids = (rows || []).map((r) => r.user_id);
  if (!ids.length) return NextResponse.json({ error: "No one has joined the launch team yet." }, { status: 400 });
  const author = profile?.display_name || "The author";
  const title = auth.project.title || "the book";

  await admin.from("beta_notifications").insert(
    ids.map((uid) => ({ user_id: uid, type: "author_thanks", title: `${author} thanked the launch team`, body: message, href: null, meta: { projectId: id } }))
  );
  await admin.from("author_thanks").insert({ project_id: id, author_user_id: auth.user.id, kind: "team", message });

  const emailIds = [...(await optedInUserIds(admin, ids))];
  const { data: emails } = emailIds.length ? await admin.from("profiles").select("email").in("id", emailIds) : { data: [] };
  const mail = renderEmail({
    heading: `A thank-you from ${author}`,
    paragraphs: [message, `You were on the launch team for ${title}.`],
    button: { label: "See your badges", url: appUrl("/beta/dashboard") },
    notification: true,
  });
  const queue = (emails || [])
    .filter((p) => String(p.email || "").includes("@"))
    .map((p) => ({ to: p.email as string, subject: `A thank-you from ${author}`, html: mail.html, text: mail.text, replyTo: profile?.email, kind: "notification" }));
  if (queue.length) {
    await enqueueEmails(admin, queue);
    await processEmailQueue(admin, { timeBudgetMs: 15_000 });
  }
  return NextResponse.json({ ok: true, thanked: ids.length });
}

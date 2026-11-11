import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { JOBS_HINT, acceptInvite } from "@/lib/market-jobs";
import { marketType } from "@/lib/market-types";

/** What the invited pro sees before signing in: who's asking, for what, and the brief. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,64}$/.test(token)) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  const admin = createServiceClient();
  const { data: job, error } = await admin.from("market_jobs").select("id, author_id, pro_id, invite_email, title, brief, market_type, deadline, status").eq("invite_token", token).maybeSingle();
  if (error) return NextResponse.json({ error: JOBS_HINT }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  const { data: author } = await admin.from("profiles").select("display_name").eq("id", job.author_id).maybeSingle();
  const { data: account } = await admin.from("profiles").select("id").ilike("email", String(job.invite_email || "")).maybeSingle();
  return NextResponse.json({
    jobId: job.id,
    accepted: Boolean(job.pro_id),
    email: job.invite_email,
    author: (author?.display_name as string) || "An author",
    title: job.title,
    brief: job.brief,
    type: marketType(job.market_type as string)?.label || job.market_type,
    deadline: job.deadline,
    closed: ["cancelled", "declined"].includes(job.status as string),
    hasAccount: Boolean(account),
  });
}

/** Accept, signed in as the invited email. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const jobId = await acceptInvite(createServiceClient(), token, { id: user.id, email: user.email || null });
    return NextResponse.json({ ok: true, jobId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't accept the invite" }, { status: 400 });
  }
}

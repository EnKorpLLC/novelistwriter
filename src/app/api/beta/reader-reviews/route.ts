import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/beta-social";
import { linkInvitesForEmail } from "@/lib/beta-platform";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const email = String(url.searchParams.get("email") || "")
    .trim()
    .toLowerCase();
  const mine = url.searchParams.get("mine") === "1";
  const readerUserId = url.searchParams.get("readerUserId");

  const admin = createServiceClient();

  if (mine) {
    await linkInvitesForEmail(admin, user.id, user.email);
    const myEmail = String(user.email || "")
      .trim()
      .toLowerCase();
    const [{ data: byUser }, { data: byEmail }] = await Promise.all([
      admin
        .from("beta_reader_reviews")
        .select(
          "id, author_user_id, reader_user_id, reader_email, project_id, invite_id, rating, body, created_at"
        )
        .eq("reader_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200),
      myEmail.includes("@")
        ? admin
            .from("beta_reader_reviews")
            .select(
              "id, author_user_id, reader_user_id, reader_email, project_id, invite_id, rating, body, created_at"
            )
            .ilike("reader_email", myEmail)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [] as never[] }),
    ]);
    const seen = new Set<string>();
    const data = [...(byUser || []), ...(byEmail || [])].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    const authorIds = [...new Set(data.map((r) => r.author_user_id))];
    const projectIds = [...new Set(data.map((r) => r.project_id).filter(Boolean))] as string[];
    const [{ data: authors }, { data: projects }] = await Promise.all([
      authorIds.length
        ? admin.from("profiles").select("id, display_name").in("id", authorIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
      projectIds.length
        ? admin.from("projects").select("id, title").in("id", projectIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
    const authorName = new Map((authors || []).map((a) => [a.id, a.display_name]));
    const projectTitle = new Map((projects || []).map((p) => [p.id, p.title]));

    return NextResponse.json({
      reviews: data.map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        createdAt: r.created_at,
        authorName: authorName.get(r.author_user_id) || "Author",
        projectTitle: r.project_id ? projectTitle.get(r.project_id) || null : null,
      })),
    });
  }

  // Author looking up a reader's reputation (by email or user id)
  if (!email.includes("@") && !readerUserId) {
    return NextResponse.json({ error: "email or readerUserId required" }, { status: 400 });
  }

  let q = admin
    .from("beta_reader_reviews")
    .select(
      "id, author_user_id, reader_user_id, reader_email, project_id, invite_id, rating, body, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (email.includes("@")) {
    q = q.ilike("reader_email", email);
  } else if (readerUserId) {
    q = q.eq("reader_user_id", readerUserId);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  }

  const authorIds = [...new Set((data || []).map((r) => r.author_user_id))];
  const projectIds = [...new Set((data || []).map((r) => r.project_id).filter(Boolean))] as string[];
  const [{ data: authors }, { data: projects }] = await Promise.all([
    authorIds.length
      ? admin.from("profiles").select("id, display_name").in("id", authorIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    projectIds.length
      ? admin.from("projects").select("id, title").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const authorName = new Map((authors || []).map((a) => [a.id, a.display_name]));
  const projectTitle = new Map((projects || []).map((p) => [p.id, p.title]));

  return NextResponse.json({
    reviews: (data || []).map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: r.created_at,
      authorName: authorName.get(r.author_user_id) || "Author",
      authorUserId: r.author_user_id,
      projectTitle: r.project_id ? projectTitle.get(r.project_id) || null : null,
      mine: r.author_user_id === user.id,
    })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    inviteId?: string;
    readerEmail?: string;
    readerUserId?: string | null;
    projectId?: string;
    rating?: number | null;
    text?: string;
  };

  const text = String(body.text || "").trim().slice(0, 4000);
  if (!text) return NextResponse.json({ error: "Review text required" }, { status: 400 });

  const rating =
    body.rating == null ? null : Math.max(1, Math.min(5, Math.round(Number(body.rating))));

  const admin = createServiceClient();
  let readerEmail = String(body.readerEmail || "")
    .trim()
    .toLowerCase();
  let readerUserId = body.readerUserId || null;
  let projectId = body.projectId || null;
  const inviteId = body.inviteId || null;

  if (inviteId) {
    const { data: invite } = await admin
      .from("beta_invites")
      .select("id, email, reader_user_id, project_id, user_id")
      .eq("id", inviteId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    readerEmail = invite.email.trim().toLowerCase();
    readerUserId = invite.reader_user_id;
    projectId = invite.project_id;
  } else {
    if (!readerEmail.includes("@") || !projectId) {
      return NextResponse.json({ error: "inviteId or readerEmail+projectId required" }, { status: 400 });
    }
    const { data: owned } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await admin
    .from("beta_reader_reviews")
    .insert({
      author_user_id: user.id,
      reader_user_id: readerUserId,
      reader_email: readerEmail,
      project_id: projectId,
      invite_id: inviteId,
      rating,
      body: text,
    })
    .select("id, rating, body, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
  }

  // Notify the reader if they have an account
  let notifyUserId = readerUserId;
  if (!notifyUserId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", readerEmail)
      .maybeSingle();
    notifyUserId = profile?.id || null;
  }

  if (notifyUserId) {
    const { data: author } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    await createNotification(admin, {
      userId: notifyUserId,
      type: "reader_review",
      title: `${author?.display_name || "An author"} left you a review`,
      body: text.slice(0, 200),
      href: "/beta/dashboard?tab=reviews",
      meta: { reviewId: data.id },
    });
  }

  return NextResponse.json({ ok: true, review: data });
}

function migrationHint(message: string) {
  if (message.includes("beta_reader_reviews")) {
    return "Database needs an update. Run supabase/migration_beta_social.sql in the Supabase SQL editor.";
  }
  return message;
}

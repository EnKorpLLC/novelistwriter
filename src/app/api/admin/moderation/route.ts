import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const [{ data: reviews, error: revErr }, { data: comments, error: comErr }] = await Promise.all([
    admin
      .from("beta_book_reviews")
      .select("id, project_id, invite_id, body, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("beta_comments")
      .select("id, project_id, invite_id, body, excerpt, created_at")
      .is("parent_id", null)
      .not("invite_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (revErr || comErr) {
    return NextResponse.json({ error: (revErr || comErr)!.message }, { status: 500 });
  }

  const projectIds = [
    ...new Set([...(reviews || []), ...(comments || [])].map((r) => r.project_id)),
  ];
  const inviteIds = [
    ...new Set(
      [...(reviews || []), ...(comments || [])].map((r) => r.invite_id).filter(Boolean)
    ),
  ] as string[];
  const [{ data: projects }, { data: invites }] = await Promise.all([
    projectIds.length
      ? admin.from("projects").select("id, title, beta_ready").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; title: string; beta_ready: boolean }[] }),
    inviteIds.length
      ? admin.from("beta_invites").select("id, email, display_name").in("id", inviteIds)
      : Promise.resolve({ data: [] as { id: string; email: string; display_name: string | null }[] }),
  ]);
  const projectById = new Map((projects || []).map((p) => [p.id, p]));
  const readerById = new Map(
    (invites || []).map((i) => [i.id, { email: i.email, name: i.display_name || null }])
  );

  const shape = (r: { id: string; project_id: string; invite_id: string | null; body: string; created_at: string }) => {
    const p = projectById.get(r.project_id);
    const reader = r.invite_id ? readerById.get(r.invite_id) : null;
    return {
      id: r.id,
      projectId: r.project_id,
      bookTitle: p?.title || "Untitled",
      bookListed: Boolean(p?.beta_ready),
      readerName: reader?.name || null,
      readerEmail: reader?.email || null,
      body: r.body,
      createdAt: r.created_at,
    };
  };

  return NextResponse.json({
    reviews: (reviews || []).map(shape),
    comments: (comments || []).map((c) => ({ ...shape(c), excerpt: c.excerpt || null })),
  });
}

export async function DELETE(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { kind?: "review" | "comment"; id?: string };
  if (!body.id || (body.kind !== "review" && body.kind !== "comment")) {
    return NextResponse.json({ error: "kind and id required" }, { status: 400 });
  }
  const table = body.kind === "review" ? "beta_book_reviews" : "beta_comments";
  const { error } = await auth.admin.from(table).delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

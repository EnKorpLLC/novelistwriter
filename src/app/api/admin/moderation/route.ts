import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePlatformAdmin } from "@/lib/platform-admin";

const PAGE_SIZES = [10, 25, 50];

function likeTerm(raw: string | null) {
  const s = String(raw || "").trim().replace(/[%_,()]/g, " ").trim();
  return s ? `%${s}%` : null;
}

function dayStart(raw: string | null) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return `${raw}T00:00:00.000Z`;
}

function dayAfter(raw: string | null) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/** Project ids matching the book title and/or author filters; null means "no filter". */
async function filteredProjectIds(
  admin: SupabaseClient,
  book: string | null,
  author: string | null
): Promise<string[] | null> {
  if (!book && !author) return null;
  let authorIds: string[] | null = null;
  if (author) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .or(`display_name.ilike.${author},email.ilike.${author}`)
      .limit(500);
    authorIds = (data || []).map((p) => p.id);
    if (!authorIds.length) return [];
  }
  // Ids go into the next query's URL; keep the list short enough for PostgREST
  let q = admin.from("projects").select("id").limit(300);
  if (book) q = q.ilike("title", book);
  if (authorIds) q = q.in("user_id", authorIds);
  const { data } = await q;
  return (data || []).map((p) => p.id);
}

export async function GET(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "comment" ? "comment" : "review";
  const pageSize = PAGE_SIZES.includes(Number(url.searchParams.get("pageSize")))
    ? Number(url.searchParams.get("pageSize"))
    : 10;
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const book = likeTerm(url.searchParams.get("book"));
  const author = likeTerm(url.searchParams.get("author"));
  const from = dayStart(url.searchParams.get("from"));
  const to = dayAfter(url.searchParams.get("to"));

  const projectIds = await filteredProjectIds(admin, book, author);
  if (projectIds && !projectIds.length) {
    return NextResponse.json({ kind, items: [], total: 0, page: 1, pageSize });
  }

  const table = kind === "review" ? "beta_book_reviews" : "beta_comments";
  const fields =
    kind === "review"
      ? "id, project_id, invite_id, body, created_at"
      : "id, project_id, invite_id, parent_id, author_user_id, body, excerpt, created_at";
  let q = admin
    .from(table)
    .select(fields, { count: "exact" })
    .order("created_at", { ascending: false });
  if (projectIds) q = q.in("project_id", projectIds);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lt("created_at", to);
  const offset = (page - 1) * pageSize;
  const { data, count, error } = await q.range(offset, offset + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    project_id: string;
    invite_id: string | null;
    parent_id?: string | null;
    author_user_id?: string | null;
    body: string;
    excerpt?: string | null;
    created_at: string;
  };
  const rows = (data || []) as unknown as Row[];

  const pIds = [...new Set(rows.map((r) => r.project_id))];
  const iIds = [...new Set(rows.map((r) => r.invite_id).filter(Boolean))] as string[];
  const [{ data: projects }, { data: invites }] = await Promise.all([
    pIds.length
      ? admin.from("projects").select("id, title, beta_ready, user_id").in("id", pIds)
      : Promise.resolve({ data: [] as { id: string; title: string; beta_ready: boolean; user_id: string }[] }),
    iIds.length
      ? admin.from("beta_invites").select("id, email, display_name").in("id", iIds)
      : Promise.resolve({ data: [] as { id: string; email: string; display_name: string | null }[] }),
  ]);
  const projectById = new Map((projects || []).map((p) => [p.id, p]));
  const authorIds = [...new Set((projects || []).map((p) => p.user_id))];
  const { data: authors } = authorIds.length
    ? await admin.from("profiles").select("id, display_name, email").in("id", authorIds)
    : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
  const authorById = new Map((authors || []).map((a) => [a.id, a.display_name || a.email || "Author"]));
  const readerById = new Map((invites || []).map((i) => [i.id, i]));

  return NextResponse.json({
    kind,
    page,
    pageSize,
    total: count || 0,
    items: rows.map((r) => {
      const p = projectById.get(r.project_id);
      const reader = r.invite_id ? readerById.get(r.invite_id) : null;
      const byAuthor = Boolean(r.author_user_id) && !r.invite_id;
      return {
        id: r.id,
        projectId: r.project_id,
        bookTitle: p?.title || "Untitled",
        bookListed: Boolean(p?.beta_ready),
        authorName: p ? authorById.get(p.user_id) || "Author" : "Author",
        writtenBy: byAuthor ? "author" : "reader",
        isReply: Boolean(r.parent_id),
        readerName: reader?.display_name || null,
        readerEmail: reader?.email || null,
        body: r.body,
        excerpt: r.excerpt || null,
        createdAt: r.created_at,
      };
    }),
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

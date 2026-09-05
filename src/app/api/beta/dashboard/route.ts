import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import {
  genreLabel,
  isActiveReaderStatus,
  linkInvitesForEmail,
  normalizeRoles,
} from "@/lib/beta-platform";
import { computeReaderStats } from "@/lib/beta-social";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  await linkInvitesForEmail(admin, user.id, user.email);

  const email = String(user.email || "")
    .trim()
    .toLowerCase();

  const [{ data: profile }, { data: byUser }, { data: byEmail }, { data: readyProjects }] =
    await Promise.all([
      supabase.from("profiles").select("is_author, is_beta_reader, display_name").eq("id", user.id).maybeSingle(),
      admin
        .from("beta_invites")
        .select(
          "id, project_id, status, last_read_at, current_chapter_id, finished_at, display_name, created_at"
        )
        .eq("reader_user_id", user.id),
      email.includes("@")
        ? admin
            .from("beta_invites")
            .select(
              "id, project_id, status, last_read_at, current_chapter_id, finished_at, display_name, created_at"
            )
            .ilike("email", email)
        : Promise.resolve({ data: [] as never[] }),
      admin
        .from("projects")
        .select("id, title, genre, cover_path, updated_at, user_id, beta_ready")
        .eq("beta_ready", true)
        .order("genre", { ascending: true })
        .order("title", { ascending: true }),
    ]);

  const inviteMap = new Map<string, (typeof byUser extends (infer T)[] | null ? T : never)>();
  for (const inv of [...(byUser || []), ...(byEmail || [])]) {
    const existing = inviteMap.get(inv.project_id);
    if (!existing || (inv.last_read_at || "") > (existing.last_read_at || "")) {
      inviteMap.set(inv.project_id, inv);
    }
  }
  const invites = [...inviteMap.values()];
  const projectIds = [...new Set(invites.map((i) => i.project_id))];

  const { data: shelfProjects } = projectIds.length
    ? await admin.from("projects").select("id, title, genre, cover_path, updated_at, user_id").in("id", projectIds)
    : { data: [] as { id: string; title: string; genre: string | null; cover_path: string | null; updated_at: string; user_id: string }[] };

  const projectById = new Map((shelfProjects || []).map((p) => [p.id, p]));
  const authorIds = [
    ...new Set([
      ...(shelfProjects || []).map((p) => p.user_id),
      ...(readyProjects || []).map((p) => p.user_id),
    ]),
  ];
  const { data: authors } = authorIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", authorIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const authorName = new Map((authors || []).map((a) => [a.id, a.display_name]));

  const shelf = invites
    .filter((i) => isActiveReaderStatus(i.status) || i.finished_at)
    .map((i) => {
      const p = projectById.get(i.project_id);
      return {
        inviteId: i.id,
        projectId: i.project_id,
        status: i.status,
        lastReadAt: i.last_read_at,
        currentChapterId: i.current_chapter_id,
        finishedAt: i.finished_at,
        title: p?.title || "Manuscript",
        genre: genreLabel(p?.genre),
        authorName: p ? authorName.get(p.user_id) || "Author" : "Author",
        coverUrl: p
          ? coverPublicUrl(projectCoverPath(p), p.updated_at ? Date.parse(p.updated_at) : undefined)
          : null,
      };
    })
    .sort((a, b) => String(b.lastReadAt || "").localeCompare(String(a.lastReadAt || "")));

  const shelfIds = new Set(shelf.map((s) => s.projectId));
  const catalogRaw = (readyProjects || []).filter((p) => !shelfIds.has(p.id));
  const byGenre = new Map<string, typeof catalogRaw>();
  for (const p of catalogRaw) {
    const g = genreLabel(p.genre);
    const list = byGenre.get(g) || [];
    list.push(p);
    byGenre.set(g, list);
  }
  const catalog = [...byGenre.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([genre, books]) => ({
      genre,
      books: books
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((p) => ({
          projectId: p.id,
          title: p.title,
          genre: genreLabel(p.genre),
          authorUserId: p.user_id,
          authorName: authorName.get(p.user_id) || "Author",
          coverUrl: coverPublicUrl(
            projectCoverPath(p),
            p.updated_at ? Date.parse(p.updated_at) : undefined
          ),
        })),
    }));

  return NextResponse.json({
    roles: normalizeRoles(profile),
    displayName: profile?.display_name || null,
    stats: computeReaderStats(invites),
    shelf,
    catalog,
  });
}

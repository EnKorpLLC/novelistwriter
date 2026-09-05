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
import { revokeProjectBetaAccess } from "@/lib/beta-server";
import { catalogLabelsForProject } from "@/lib/book-keywords";

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
        .select("id, title, genre, cover_path, updated_at, user_id, beta_ready, metadata")
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
    ? await admin
        .from("projects")
        .select("id, title, genre, cover_path, updated_at, user_id, metadata")
        .in("id", projectIds)
    : {
        data: [] as {
          id: string;
          title: string;
          genre: string | null;
          cover_path: string | null;
          updated_at: string;
          user_id: string;
          metadata: Record<string, unknown> | null;
        }[],
      };

  const projectById = new Map((shelfProjects || []).map((p) => [p.id, p]));
  const authorIds = [
    ...new Set([
      ...(shelfProjects || []).map((p) => p.user_id),
      ...(readyProjects || []).map((p) => p.user_id),
    ]),
  ];
  const [{ data: authors }, { data: authorTiers }] = await Promise.all([
    authorIds.length
      ? admin.from("profiles").select("id, display_name").in("id", authorIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    authorIds.length
      ? admin.from("credit_balances").select("user_id, subscription_tier").in("user_id", authorIds)
      : Promise.resolve({ data: [] as { user_id: string; subscription_tier: string | null }[] }),
  ]);
  const authorName = new Map((authors || []).map((a) => [a.id, a.display_name]));
  const studioAuthors = new Set(
    (authorTiers || [])
      .filter((t) => t.subscription_tier === "studio")
      .map((t) => t.user_id)
  );

  // Drop non-Studio listings that slipped into beta_ready (e.g. free-plan authors)
  const nonStudioReady = (readyProjects || []).filter((p) => !studioAuthors.has(p.user_id));
  if (nonStudioReady.length) {
    const ids = nonStudioReady.map((p) => p.id);
    await admin
      .from("projects")
      .update({ beta_ready: false, updated_at: new Date().toISOString() })
      .in("id", ids);
    await Promise.all(ids.map((id) => revokeProjectBetaAccess(admin, id)));
  }

  const shelf = invites
    .filter((i) => isActiveReaderStatus(i.status) || i.finished_at)
    .map((i) => {
      const p = projectById.get(i.project_id);
      const labels = p ? catalogLabelsForProject(p) : ["Uncategorized"];
      return {
        inviteId: i.id,
        projectId: i.project_id,
        status: i.status,
        lastReadAt: i.last_read_at,
        currentChapterId: i.current_chapter_id,
        finishedAt: i.finished_at,
        title: p?.title || "Manuscript",
        genre: labels[0] || genreLabel(p?.genre),
        authorName: p ? authorName.get(p.user_id) || "Author" : "Author",
        coverUrl: p
          ? coverPublicUrl(projectCoverPath(p), p.updated_at ? Date.parse(p.updated_at) : undefined)
          : null,
      };
    })
    .sort((a, b) => String(b.lastReadAt || "").localeCompare(String(a.lastReadAt || "")));

  const shelfIds = new Set(shelf.map((s) => s.projectId));
  const catalogRaw = (readyProjects || []).filter(
    (p) => !shelfIds.has(p.id) && studioAuthors.has(p.user_id)
  );

  type CatalogBook = (typeof catalogRaw)[number];
  const byKeyword = new Map<string, CatalogBook[]>();
  for (const p of catalogRaw) {
    const labels = catalogLabelsForProject(p);
    for (const label of labels) {
      const list = byKeyword.get(label) || [];
      list.push(p);
      byKeyword.set(label, list);
    }
  }
  const catalog = [...byKeyword.entries()]
    .sort(([a], [b]) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    })
    .map(([genre, books]) => ({
      genre,
      books: books
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((p) => ({
          projectId: p.id,
          title: p.title,
          genre,
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

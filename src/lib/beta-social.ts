import type { SupabaseClient } from "@supabase/supabase-js";

export type ReaderStats = {
  finished: number;
  dnf: number;
  reading: number;
};

type InviteStatRow = {
  status: string;
  finished_at?: string | null;
};

/** Aggregate platform reading stats from invite rows (one row per book ideally). */
export function computeReaderStats(invites: InviteStatRow[]): ReaderStats {
  let finished = 0;
  let dnf = 0;
  let reading = 0;
  for (const i of invites) {
    if (i.finished_at) {
      finished += 1;
      continue;
    }
    if (i.status === "dnf") {
      dnf += 1;
      continue;
    }
    if (i.status === "pending" || i.status === "accepted") {
      reading += 1;
    }
  }
  return { finished, dnf, reading };
}

export type NotificationType =
  | "reader_review"
  | "message"
  | "author_new_book"
  | "author_rerelease"
  | "application_update";

export async function createNotification(
  admin: SupabaseClient,
  opts: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string | null;
    href?: string | null;
    meta?: Record<string, unknown>;
  }
) {
  if (!opts.userId) return;
  await admin.from("beta_notifications").insert({
    user_id: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body || null,
    href: opts.href || null,
    meta: opts.meta || {},
  });
}

export async function notifyAuthorFollowersOfReady(
  admin: SupabaseClient,
  opts: {
    authorUserId: string;
    authorName: string;
    projectId: string;
    projectTitle: string;
    rerelease: boolean;
  }
) {
  const { data: followers } = await admin
    .from("beta_author_follows")
    .select("reader_user_id")
    .eq("author_user_id", opts.authorUserId);

  const rows = (followers || [])
    .map((f) => f.reader_user_id)
    .filter(Boolean)
    .map((readerId) => ({
      user_id: readerId as string,
      type: opts.rerelease ? ("author_rerelease" as const) : ("author_new_book" as const),
      title: opts.rerelease
        ? `${opts.authorName} reopened a beta`
        : `${opts.authorName} posted a new beta`,
      body: opts.projectTitle,
      href: `/beta/book/${opts.projectId}`,
      meta: { projectId: opts.projectId, authorUserId: opts.authorUserId },
    }));

  if (rows.length) {
    await admin.from("beta_notifications").insert(rows);
  }
}

/** Load invites for a reader identity and compute stats. */
export async function fetchReaderStatsForIdentity(
  admin: SupabaseClient,
  opts: { userId?: string | null; email?: string | null }
): Promise<ReaderStats> {
  const email = String(opts.email || "")
    .trim()
    .toLowerCase();
  const rows: InviteStatRow[] = [];
  const seen = new Set<string>();

  if (opts.userId) {
    const { data } = await admin
      .from("beta_invites")
      .select("id, project_id, status, finished_at")
      .eq("reader_user_id", opts.userId);
    for (const r of data || []) {
      if (seen.has(r.project_id)) continue;
      seen.add(r.project_id);
      rows.push(r);
    }
  }
  if (email.includes("@")) {
    const { data } = await admin
      .from("beta_invites")
      .select("id, project_id, status, finished_at")
      .ilike("email", email);
    for (const r of data || []) {
      if (seen.has(r.project_id)) continue;
      seen.add(r.project_id);
      rows.push(r);
    }
  }
  return computeReaderStats(rows);
}

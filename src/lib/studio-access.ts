import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { userHasStudio, rowHasStudio } from "@/lib/credits";

export const READER_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function inReaderGrace(project: { reader_grace_until?: string | null } | null | undefined): boolean {
  const until = project?.reader_grace_until;
  return Boolean(until && Date.parse(until) > Date.now());
}

/**
 * The author lost Studio: stop new readers right away (catalog, invites, requests) but let
 * current beta and ARC readers keep going for 7 more days. Safe to call repeatedly.
 */
export async function pauseForLostStudio(admin: SupabaseClient, projectIds: string[]) {
  if (!projectIds.length) return;
  const now = new Date().toISOString();
  await admin.from("projects").update({ beta_ready: false, updated_at: now }).in("id", projectIds).eq("beta_ready", true);
  await admin
    .from("projects")
    .update({ reader_grace_until: new Date(Date.now() + READER_GRACE_DAYS * DAY_MS).toISOString() })
    .in("id", projectIds)
    .is("reader_grace_until", null);
}

/** Books whose author is on Free beyond their project slots: the most recently edited stay open. */
async function reconcileProjectLocks(
  admin: SupabaseClient,
  userId: string,
  projects: { id: string; title: string; updated_at: string | null; locked_at: string | null }[]
) {
  const [{ data: bal }, { count: unlocks }] = await Promise.all([
    admin.from("credit_balances").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("project_unlocks").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const unlimited = bal?.subscription_tier === "pro" || rowHasStudio(bal);
  const now = new Date().toISOString();
  if (unlimited) {
    const lockedIds = projects.filter((p) => p.locked_at).map((p) => p.id);
    if (lockedIds.length) await admin.from("projects").update({ locked_at: null }).in("id", lockedIds);
    return [];
  }
  const allowed = 1 + (unlocks || 0);
  // Already-open books keep their place, so editing one never flips which books are locked
  const ordered = [...projects].sort((a, b) => {
    if (Boolean(a.locked_at) !== Boolean(b.locked_at)) return a.locked_at ? 1 : -1;
    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  });
  const keep = ordered.slice(0, allowed);
  const lock = ordered.slice(allowed);
  const unlockIds = keep.filter((p) => p.locked_at).map((p) => p.id);
  const lockIds = lock.filter((p) => !p.locked_at).map((p) => p.id);
  if (unlockIds.length) await admin.from("projects").update({ locked_at: null }).in("id", unlockIds);
  if (lockIds.length) await admin.from("projects").update({ locked_at: now }).in("id", lockIds);
  return lock.map((p) => ({ id: p.id, title: p.title }));
}

/**
 * Bring an author's books in line with their plan. Runs on dashboard and project load,
 * so no scheduled job is needed. Returns the books that are locked to export-only.
 */
export async function reconcileAuthorAccess(
  admin: SupabaseClient,
  userId: string
): Promise<{ studio: boolean; locked: { id: string; title: string }[] }> {
  const [studio, { data: projects, error }] = await Promise.all([
    userHasStudio(userId),
    admin
      .from("projects")
      .select("id, title, updated_at, beta_ready, arc_open, reader_grace_until, locked_at")
      .eq("user_id", userId),
  ]);
  // Before migration_rewards.sql the new columns are missing; change nothing
  if (error || !projects) return { studio, locked: [] };

  if (studio) {
    const graceIds = projects.filter((p) => p.reader_grace_until).map((p) => p.id);
    if (graceIds.length) await admin.from("projects").update({ reader_grace_until: null }).in("id", graceIds);
  } else {
    const open = projects.filter((p) => (p.beta_ready || p.arc_open) && !p.reader_grace_until).map((p) => p.id);
    await pauseForLostStudio(admin, open);
  }
  const locked = await reconcileProjectLocks(admin, userId, projects);
  return { studio, locked };
}

/** Server-side refusal for edits to an export-only project. */
export async function projectLockedMessage(
  client: SupabaseClient,
  projectId: string
): Promise<string | null> {
  const { data, error } = await client.from("projects").select("locked_at").eq("id", projectId).maybeSingle();
  if (error || !data?.locked_at) return null;
  return "This project is locked on the Free plan. You can still export it. Upgrade, start a Studio pass, or buy a project unlock to edit it again.";
}

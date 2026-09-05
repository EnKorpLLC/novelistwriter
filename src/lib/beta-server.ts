import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BETA_CLOSED_REASON,
  BETA_PERIOD_ENDED_REASON,
  isBetaExpired,
  sanitizeDisplayName,
} from "@/lib/beta-access";
import { isActiveReaderStatus } from "@/lib/beta-platform";

type Admin = SupabaseClient;

export type BetaInviteRow = {
  id: string;
  project_id: string;
  user_id: string;
  email: string;
  status: string;
  status_reason: string | null;
  display_name: string | null;
  application_answers: unknown;
  token: string;
  reader_user_id: string | null;
  current_chapter_id: string | null;
  last_read_at: string | null;
  finished_at: string | null;
  dnf_reason: string | null;
  dnf_at: string | null;
};

/** Find invite for a logged-in reader on a project (by user id or email). */
export async function findReaderInvite(
  admin: Admin,
  opts: { projectId: string; userId: string; email?: string | null }
): Promise<BetaInviteRow | null> {
  const { data: byUser } = await admin
    .from("beta_invites")
    .select("*")
    .eq("project_id", opts.projectId)
    .eq("reader_user_id", opts.userId)
    .maybeSingle();
  if (byUser) return byUser as BetaInviteRow;

  const email = String(opts.email || "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) return null;

  const { data: byEmail } = await admin
    .from("beta_invites")
    .select("*")
    .eq("project_id", opts.projectId)
    .ilike("email", email)
    .maybeSingle();

  if (!byEmail) return null;

  if (!byEmail.reader_user_id) {
    await admin
      .from("beta_invites")
      .update({ reader_user_id: opts.userId })
      .eq("id", byEmail.id);
    return { ...byEmail, reader_user_id: opts.userId } as BetaInviteRow;
  }

  return byEmail as BetaInviteRow;
}

export function inviteAllowsReading(invite: { status: string } | null | undefined): boolean {
  return Boolean(invite && isActiveReaderStatus(invite.status));
}

export async function upsertBetaContact(
  admin: Admin,
  opts: {
    projectId: string;
    userId: string;
    email: string;
    displayName?: string | null;
  }
) {
  const email = opts.email.trim().toLowerCase();
  const displayName = sanitizeDisplayName(opts.displayName || "");
  const { data: existing } = await admin
    .from("beta_contacts")
    .select("id, display_name")
    .eq("project_id", opts.projectId)
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    const nextName = displayName || existing.display_name || null;
    await admin
      .from("beta_contacts")
      .update({
        email,
        display_name: nextName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  await admin.from("beta_contacts").insert({
    project_id: opts.projectId,
    user_id: opts.userId,
    email,
    display_name: displayName || null,
  });
}

const ACTIVE_INVITE_STATUSES = ["pending", "accepted", "requested", "dnf"] as const;

/** Revoke all open invites for a project (contacts kept for re-invite). */
export async function revokeProjectBetaAccess(
  admin: Admin,
  projectId: string,
  reason: string = BETA_CLOSED_REASON
): Promise<number> {
  const { data } = await admin
    .from("beta_invites")
    .update({
      status: "revoked",
      status_reason: reason,
    })
    .eq("project_id", projectId)
    .in("status", [...ACTIVE_INVITE_STATUSES])
    .select("id");
  return data?.length || 0;
}

/** If the beta period ended, revoke active invites with a fixed reason. Contacts are kept. */
export async function enforceBetaExpiry(
  admin: Admin,
  project: { id: string; beta_expires_at?: string | null }
): Promise<{ expired: boolean }> {
  if (!isBetaExpired(project.beta_expires_at)) return { expired: false };

  await revokeProjectBetaAccess(admin, project.id, BETA_PERIOD_ENDED_REASON);
  return { expired: true };
}

/**
 * If the book is not marked ready, revoke leftover reader access.
 * Keeps catalog/toggle and live reading in sync.
 */
export async function enforceBetaReady(
  admin: Admin,
  project: { id: string; beta_ready?: boolean | null }
): Promise<{ closed: boolean }> {
  if (project.beta_ready) return { closed: false };
  await revokeProjectBetaAccess(admin, project.id, BETA_CLOSED_REASON);
  return { closed: true };
}

/** Expiry + ready gates; revokes invites when either closes the book. */
export async function enforceBetaAccessGates(
  admin: Admin,
  project: {
    id: string;
    beta_expires_at?: string | null;
    beta_ready?: boolean | null;
  }
): Promise<{ blocked: false } | { blocked: true; reason: string }> {
  const { expired } = await enforceBetaExpiry(admin, project);
  if (expired) return { blocked: true, reason: BETA_PERIOD_ENDED_REASON };
  const { closed } = await enforceBetaReady(admin, project);
  if (closed) return { blocked: true, reason: BETA_CLOSED_REASON };
  return { blocked: false };
}

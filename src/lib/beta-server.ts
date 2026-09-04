import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BETA_PERIOD_ENDED_REASON,
  isBetaExpired,
  sanitizeDisplayName,
} from "@/lib/beta-access";

type Admin = SupabaseClient;

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

/** If the beta period ended, revoke active invites with a fixed reason. Contacts are kept. */
export async function enforceBetaExpiry(
  admin: Admin,
  project: { id: string; beta_expires_at?: string | null }
): Promise<{ expired: boolean }> {
  if (!isBetaExpired(project.beta_expires_at)) return { expired: false };

  await admin
    .from("beta_invites")
    .update({
      status: "revoked",
      status_reason: BETA_PERIOD_ENDED_REASON,
    })
    .eq("project_id", project.id)
    .in("status", ["pending", "accepted", "requested", "dnf"]);

  return { expired: true };
}

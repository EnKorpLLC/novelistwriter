import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileRoles = {
  is_author: boolean;
  is_beta_reader: boolean;
};

export const LAST_SIDE_KEY = "nw_last_side";
export type AppSide = "author" | "beta";

export function rememberSide(side: AppSide) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_SIDE_KEY, side);
    document.cookie = `${LAST_SIDE_KEY}=${side}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* ignore */
  }
}

export function readRememberedSide(): AppSide | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LAST_SIDE_KEY);
    if (v === "author" || v === "beta") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function normalizeRoles(profile: Partial<ProfileRoles> | null | undefined): ProfileRoles {
  return {
    is_author: profile?.is_author !== false,
    is_beta_reader: Boolean(profile?.is_beta_reader),
  };
}

/** Post-login home based on roles and optional next path. */
export function homePathForRoles(
  roles: ProfileRoles,
  next?: string | null,
  lastSide?: AppSide | null
): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  if (roles.is_author && !roles.is_beta_reader) return "/dashboard";
  if (roles.is_beta_reader && !roles.is_author) return "/beta/dashboard";
  if (roles.is_author && roles.is_beta_reader) {
    if (lastSide === "beta") return "/beta/dashboard";
    return "/dashboard";
  }
  if (roles.is_author) return "/dashboard";
  if (roles.is_beta_reader) return "/beta/dashboard";
  return "/dashboard";
}

export async function fetchProfileRoles(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileRoles> {
  const { data } = await supabase
    .from("profiles")
    .select("is_author, is_beta_reader")
    .eq("id", userId)
    .maybeSingle();
  return normalizeRoles(data);
}

/** Attach invites that match the user's email to their auth user id. */
export async function linkInvitesForEmail(
  admin: SupabaseClient,
  userId: string,
  email: string | null | undefined
): Promise<number> {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalized || !normalized.includes("@")) return 0;
  const { data, error } = await admin
    .from("beta_invites")
    .update({ reader_user_id: userId })
    .ilike("email", normalized)
    .is("reader_user_id", null)
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

export const ACTIVE_READER_STATUSES = ["pending", "accepted", "dnf"] as const;

export function isActiveReaderStatus(status: string): boolean {
  return (ACTIVE_READER_STATUSES as readonly string[]).includes(status);
}

export const REACTION_EMOJIS = [
  { id: "thumbsup" as const, label: "Thumbs up", glyph: "👍" },
  { id: "thumbsdown" as const, label: "Thumbs down", glyph: "👎" },
  { id: "heart" as const, label: "Heart", glyph: "❤️" },
  { id: "laugh" as const, label: "Laugh", glyph: "😄" },
  { id: "thanks" as const, label: "Thanks", glyph: "🙏" },
];

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]["id"];

export function reactionGlyph(emojiId: string): string {
  return REACTION_EMOJIS.find((r) => r.id === emojiId)?.glyph || emojiId;
}

export function genreLabel(genre: string | null | undefined): string {
  const g = String(genre || "").trim();
  return g || "Uncategorized";
}

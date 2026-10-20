import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

const DEFAULT_ADMIN_EMAIL = "ryan.jamison87@gmail.com";

export function platformAdminEmail(): string {
  return (process.env.PLATFORM_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  return String(email || "").trim().toLowerCase() === platformAdminEmail();
}

export async function isPlatformAdmin(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email"> | null
): Promise<boolean> {
  if (!user) return false;
  if (isPlatformAdminEmail(user.email)) return true;
  const { data } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  return Boolean(data?.is_platform_admin);
}

/** For /api/admin/* routes. Returns the service client when the caller is the platform admin. */
export async function requirePlatformAdmin(): Promise<
  | { ok: true; user: User; admin: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isPlatformAdmin(supabase, user))) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, user, admin: createServiceClient() };
}

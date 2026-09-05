"use client";

import { createClient } from "@/lib/supabase/client";

/** Sign out if the current session email doesn't match the invite/apply email. */
export async function ensureAccountForEmail(intendedEmail: string): Promise<boolean> {
  const target = intendedEmail.trim().toLowerCase();
  if (!target.includes("@")) return false;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return false;
  if (user.email.trim().toLowerCase() === target) return false;
  await supabase.auth.signOut();
  return true;
}

export async function getSessionEmail(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email?.trim().toLowerCase() || null;
}

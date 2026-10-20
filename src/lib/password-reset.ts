import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, sendEmail, type SendResult } from "@/lib/email";
import { appUrl } from "@/lib/stripe";

/** Recovery link via our own mail, so users never get Supabase's stock template. */
export async function sendPasswordResetEmail(
  admin: SupabaseClient,
  rawEmail: string
): Promise<SendResult | { ok: false; error: "no_account" }> {
  const email = rawEmail.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return { ok: false, error: "no_account" };

  const link = appUrl(
    `/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=${encodeURIComponent("/auth/reset-password")}`
  );
  const mail = renderEmail({
    heading: "Reset your password",
    paragraphs: [
      "Someone asked to reset the password for this Novelist Writer account.",
      "The link works once and expires in about an hour. If you didn't ask for this, you can ignore this email.",
    ],
    button: { label: "Choose a new password", url: link },
  });
  return sendEmail({
    to: email,
    subject: "Reset your Novelist Writer password",
    text: mail.text,
    html: mail.html,
  });
}

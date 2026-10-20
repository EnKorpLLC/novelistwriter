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
  if (error || !tokenHash) {
    const notFound =
      error?.status === 404 ||
      error?.code === "user_not_found" ||
      /not.?found/i.test(error?.message || "");
    if (notFound) return { ok: false, error: "no_account" };
    console.error("[password-reset] generateLink failed", {
      status: error?.status,
      code: error?.code,
      message: error?.message || "no hashed_token returned",
    });
    return { ok: false, error: `Supabase couldn't create a reset link: ${error?.message || "no token returned"}` };
  }

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

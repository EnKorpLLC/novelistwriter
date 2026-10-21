import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, sendEmail } from "@/lib/email";

export type EmailConsent = {
  userId: string | null;
  hasAccount: boolean;
  optedIn: boolean;
};

/** Whether a person (by account id or email) agreed to notification emails. */
export async function emailConsentFor(
  admin: SupabaseClient,
  opts: { userId?: string | null; email?: string | null }
): Promise<EmailConsent> {
  const email = String(opts.email || "").trim().toLowerCase();
  if (!opts.userId && !email.includes("@")) return { userId: null, hasAccount: false, optedIn: false };
  const lookup = (fields: string) => {
    const q = admin.from("profiles").select(fields);
    return (opts.userId ? q.eq("id", opts.userId) : q.ilike("email", email)).maybeSingle();
  };
  const { data, error } = await lookup("id, email_notifications");
  // Before migration_proof_trust.sql the column is missing: treat everyone as not opted in
  const row = (error ? (await lookup("id")).data : data) as
    | { id: string; email_notifications?: boolean }
    | null;
  if (!row) return { userId: null, hasAccount: false, optedIn: false };
  return { userId: row.id, hasAccount: true, optedIn: Boolean(row.email_notifications) };
}

/** Consent for many invitees at once, keyed by lowercase email. */
export async function emailConsentByEmail(
  admin: SupabaseClient,
  people: { email: string; userId?: string | null }[]
): Promise<Map<string, EmailConsent>> {
  const out = new Map<string, EmailConsent>();
  const emails = [...new Set(people.map((p) => p.email.trim().toLowerCase()).filter((e) => e.includes("@")))];
  const ids = [...new Set(people.map((p) => p.userId).filter(Boolean))] as string[];
  if (!emails.length && !ids.length) return out;
  const fetchRows = async (fields: string) => {
    const [byEmail, byId] = await Promise.all([
      emails.length ? admin.from("profiles").select(fields).in("email", emails) : Promise.resolve({ data: [], error: null }),
      ids.length ? admin.from("profiles").select(fields).in("id", ids) : Promise.resolve({ data: [], error: null }),
    ]);
    return { rows: [...(byEmail.data || []), ...(byId.data || [])], error: byEmail.error || byId.error };
  };
  const first = await fetchRows("id, email, email_notifications");
  const rows = first.error ? (await fetchRows("id, email")).rows : first.rows;
  const typed = rows as unknown as { id: string; email: string | null; email_notifications?: boolean }[];
  const byId = new Map(typed.map((r) => [r.id, r]));
  const byEmail = new Map(typed.filter((r) => r.email).map((r) => [r.email!.toLowerCase(), r]));
  for (const p of people) {
    const key = p.email.trim().toLowerCase();
    const row = (p.userId && byId.get(p.userId)) || byEmail.get(key);
    out.set(key, row
      ? { userId: row.id, hasAccount: true, optedIn: Boolean(row.email_notifications) }
      : { userId: null, hasAccount: false, optedIn: false });
  }
  return out;
}

/** Same lookup for many accounts at once; returns the ids that opted in. */
export async function optedInUserIds(admin: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .in("id", userIds)
    .eq("email_notifications", true);
  return new Set((data || []).map((p) => p.id));
}

export async function sendWelcomeEmail(to: string) {
  const mail = renderEmail({
    heading: "Email notifications are on",
    paragraphs: [
      "You'll get reminders about your account and books, and news from authors you follow.",
      "If this landed in spam or Promotions, mark it Not spam and add this address to your contacts so the next ones reach your inbox.",
    ],
    notification: true,
  });
  return sendEmail({
    to,
    subject: "You're set to get Novelist Writer emails",
    text: mail.text,
    html: mail.html,
  });
}

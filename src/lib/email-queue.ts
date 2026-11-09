import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/stripe";

/** Room kept every day for confirmations, notifications, and receipts that can't wait */
const RESERVED_PER_DAY = 100;
/** Sends per call, so a request or the daily job finishes well inside Vercel's time limit */
const MAX_PER_RUN = 120;

export type QueuedEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  listUnsubscribe?: string | null;
  kind?: string;
};

export function dailyEmailCap() {
  return Number(process.env.EMAIL_DAILY_CAP || 500);
}

export async function enqueueEmails(admin: SupabaseClient, items: QueuedEmail[]) {
  for (let i = 0; i < items.length; i += 500) {
    await admin.from("email_queue").insert(
      items.slice(i, i + 500).map((m) => ({
        to_email: m.to,
        subject: m.subject,
        html: m.html,
        text_body: m.text,
        reply_to: m.replyTo || null,
        list_unsubscribe: m.listUnsubscribe || null,
        kind: m.kind || "launch",
      }))
    );
  }
}

/**
 * Sends what the day's budget allows, oldest first. Gmail allows about 500 a day on a regular account;
 * the rest waits for tomorrow's batch.
 */
export async function processEmailQueue(admin: SupabaseClient, opts: { timeBudgetMs?: number } = {}): Promise<{ sent: number; waiting: number }> {
  const stopAt = Date.now() + (opts.timeBudgetMs ?? 35_000);
  // A digest that couldn't go out within six days is stale; next week's replaces it
  await admin.from("email_queue").delete().eq("kind", "digest").is("sent_at", null).lt("created_at", new Date(Date.now() - 6 * 86_400_000).toISOString());
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [{ count: sentToday }, { count: waitingBefore }] = await Promise.all([
    admin.from("email_sends").select("id", { count: "exact", head: true }).gte("sent_at", since.toISOString()),
    admin.from("email_queue").select("id", { count: "exact", head: true }).is("sent_at", null),
  ]);
  const budget = Math.max(0, Math.min(MAX_PER_RUN, dailyEmailCap() - RESERVED_PER_DAY - (sentToday || 0)));
  if (!budget || !waitingBefore) return { sent: 0, waiting: waitingBefore || 0 };

  // Launch and list emails first; the weekly reader digest only uses what's left of the day's budget
  const { data: urgent } = await admin.from("email_queue").select("*").is("sent_at", null).lt("attempts", 3).neq("kind", "digest").order("id").limit(budget);
  const room = budget - (urgent?.length || 0);
  const { data: digests } = room > 0 ? await admin.from("email_queue").select("*").is("sent_at", null).lt("attempts", 3).eq("kind", "digest").order("id").limit(room) : { data: [] };
  const batch = [...(urgent || []), ...(digests || [])];
  let sent = 0;
  for (const m of batch) {
    if (Date.now() > stopAt) break;
    const r = await sendEmail({
      to: m.to_email,
      subject: m.subject,
      text: m.text_body,
      html: m.html,
      replyTo: m.reply_to,
      listUnsubscribe: m.list_unsubscribe,
    });
    if (r.ok) {
      sent += 1;
      await admin.from("email_queue").update({ sent_at: new Date().toISOString(), attempts: m.attempts + 1 }).eq("id", m.id);
    } else {
      await admin.from("email_queue").update({ attempts: m.attempts + 1, last_error: r.error.slice(0, 300) }).eq("id", m.id);
      // Gmail refusing more for today: stop and leave the rest for tomorrow
      if (/limit|quota|rate/i.test(r.error)) break;
    }
  }
  return { sent, waiting: Math.max(0, (waitingBefore || 0) - sent) };
}

/* ---------- Unsubscribe links for author list emails ---------- */

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-only";
}

function sign(authorUserId: string, email: string) {
  return createHmac("sha256", secret()).update(`${authorUserId}:${email.trim().toLowerCase()}`).digest("hex").slice(0, 32);
}

function unsubscribeQuery(authorUserId: string, email: string) {
  return new URLSearchParams({ a: authorUserId, e: email.trim().toLowerCase(), t: sign(authorUserId, email) }).toString();
}

/** Link in the email footer: a page with a confirm button, so link scanners can't unsubscribe anyone */
export function unsubscribeUrl(authorUserId: string, email: string) {
  return appUrl(`/subscribe/unsubscribe?${unsubscribeQuery(authorUserId, email)}`);
}

/** List-Unsubscribe header: mail apps POST here for one-click unsubscribe */
export function oneClickUnsubscribeUrl(authorUserId: string, email: string) {
  return appUrl(`/api/audience/unsubscribe?${unsubscribeQuery(authorUserId, email)}`);
}

/** The weekly reader digest uses the same signed links, with "digest" in place of an author id */
export const DIGEST_LIST = "digest";

export function digestUnsubscribeUrl(email: string) {
  return unsubscribeUrl(DIGEST_LIST, email);
}

export function digestOneClickUrl(email: string) {
  return oneClickUnsubscribeUrl(DIGEST_LIST, email);
}

export function verifyUnsubscribe(authorUserId: string, email: string, token: string) {
  const want = Buffer.from(sign(authorUserId, email));
  const got = Buffer.from(String(token || ""));
  return want.length === got.length && timingSafeEqual(want, got);
}

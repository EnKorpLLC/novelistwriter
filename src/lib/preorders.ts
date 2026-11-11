import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, appUrl } from "@/lib/stripe";
import { renderEmail, sendEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notifications";
import { enqueueEmails, processEmailQueue, type QueuedEmail } from "@/lib/email-queue";
import { adjustBookPurchaseForCharge } from "@/lib/direct-sales";
import { PREORDER_GRACE_DAYS, REFUND_WINDOW_DAYS, addDays, dollars, longDay } from "@/lib/direct-sale-rules";

/**
 * Direct pre-orders: the reader pays at order, the ebook is delivered when the author marks the book out now,
 * and the reader can cancel anytime before. One still waiting PREORDER_GRACE_DAYS after the date its buyer
 * was promised is refunded automatically.
 */

type Row = {
  id: string;
  project_id: string;
  author_user_id: string;
  title: string;
  price_cents: number;
  buyer_email: string;
  buyer_name: string;
  download_token: string;
  preorder_release: string;
  stripe_payment_intent: string | null;
  stripe_charge_id: string | null;
};

const COLS = "id, project_id, author_user_id, title, price_cents, buyer_email, buyer_name, download_token, preorder_release, stripe_payment_intent, stripe_charge_id";
const today = () => new Date().toISOString().slice(0, 10);

/** Has migration_preorders_extras.sql been run? */
export async function preordersReady(admin: SupabaseClient) {
  const { error } = await admin.from("book_purchases").select("preorder_release").limit(1);
  return !error;
}

/** Paid pre-orders still waiting for this book (null before the migration). */
export async function waitingPreorders(admin: SupabaseClient, projectId: string): Promise<Row[] | null> {
  const { data, error } = await admin
    .from("book_purchases")
    .select(COLS)
    .eq("project_id", projectId)
    .eq("status", "paid")
    .not("preorder_release", "is", null)
    .is("delivered_at", null)
    .limit(5000);
  return error ? null : ((data || []) as Row[]);
}

/** The book is out: every waiting pre-order gets its ebook now, and its refund window starts today. */
export async function deliverPreorders(admin: SupabaseClient, projectId: string) {
  const rows = await waitingPreorders(admin, projectId);
  if (!rows?.length) return 0;
  const now = new Date();
  await admin
    .from("book_purchases")
    .update({ delivered_at: now.toISOString(), available_at: new Date(now.getTime() + REFUND_WINDOW_DAYS * 86_400_000).toISOString() })
    .in("id", rows.map((r) => r.id));
  const queue: QueuedEmail[] = rows
    .filter((r) => r.buyer_email.includes("@"))
    .map((r) => {
      const mail = renderEmail({
        heading: `${r.title} is here`,
        paragraphs: [
          `${r.buyer_name ? `${r.buyer_name}, the` : "The"} book you pre-ordered is out today, and your ebook is ready to download. The link keeps working whenever you need it again.`,
          `Changed your mind? You can ask for a refund within ${REFUND_WINDOW_DAYS} days by replying to this email.`,
        ],
        button: { label: "Download your ebook", url: appUrl(`/purchase/${r.download_token}`) },
      });
      return { to: r.buyer_email, subject: `${r.title} is here: your pre-order is ready`, html: mail.html, text: mail.text };
    });
  if (queue.length) {
    await enqueueEmails(admin, queue);
    await processEmailQueue(admin, { timeBudgetMs: 15_000 }).catch(() => null);
  }
  await notifyUser(admin, rows[0].author_user_id, {
    type: "book_sale",
    title: `${rows.length} ${rows.length === 1 ? "pre-order" : "pre-orders"} of ${rows[0].title} delivered`,
    body: `Readers have their ebooks. Your share is paid after the ${REFUND_WINDOW_DAYS}-day refund window.`,
    href: `/project/${projectId}?tab=sell`,
  }).catch(() => null);
  return rows.length;
}

/** Full refund of a waiting pre-order: the reader cancelled, or the book is too late. */
export async function refundPreorder(admin: SupabaseClient, row: Row, reason: "cancelled" | "late") {
  const stripe = getStripe();
  if (!row.stripe_payment_intent) throw new Error("This pre-order can't be refunded automatically. Reply to your receipt email and we'll sort it out.");
  await stripe.refunds.create(
    { payment_intent: row.stripe_payment_intent, metadata: { reason: `preorder_${reason}`, purchase_id: row.id } },
    { idempotencyKey: `preorder-refund-${row.id}` }
  );
  let chargeId = row.stripe_charge_id;
  if (!chargeId) {
    const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent);
    chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as Stripe.Charge | null)?.id || null;
  }
  // The webhook does this too; doing it now means the page shows the refund straight away
  if (chargeId) await adjustBookPurchaseForCharge(admin, await stripe.charges.retrieve(chargeId), "refunded");
  if (reason === "late" && row.buyer_email.includes("@")) {
    const mail = renderEmail({
      heading: `Your pre-order of ${row.title} was refunded`,
      paragraphs: [
        `${row.title} was due on ${longDay(row.preorder_release)} and isn't out yet, so we've refunded your ${dollars(row.price_cents)} in full, as promised. It can take a few days to show on your statement.`,
        "When it does come out, it'll be on the author's page.",
      ],
    });
    await sendEmail({ to: row.buyer_email, subject: `Refunded: your pre-order of ${row.title}`, html: mail.html, text: mail.text }).catch(() => null);
  }
  if (reason === "cancelled") {
    await notifyUser(admin, row.author_user_id, {
      type: "book_sale",
      title: `A pre-order of ${row.title} was cancelled`,
      body: "The reader was refunded in full.",
      href: `/project/${row.project_id}?tab=sell`,
    }).catch(() => null);
  }
}

/** A waiting pre-order, found by its buyer's link; with the book's current release date. */
export async function preorderByToken(admin: SupabaseClient, token: string) {
  const { data, error } = await admin.from("book_purchases").select(`${COLS}, status, delivered_at`).eq("download_token", token).maybeSingle();
  if (error || !data || data.status !== "paid" || !data.preorder_release || data.delivered_at) return null;
  const { data: project } = await admin.from("projects").select("release_date, published").eq("id", data.project_id).maybeSingle();
  return { row: data as Row, releaseDate: (project?.release_date as string | null) || null, published: Boolean(project?.published) };
}

/** The reader is happy to wait for the new date: their promise (and automatic refund date) moves with it. */
export async function keepPreorder(admin: SupabaseClient, token: string) {
  const p = await preorderByToken(admin, token);
  if (!p) throw new Error("This pre-order isn't waiting anymore.");
  if (!p.releaseDate || p.releaseDate <= p.row.preorder_release) return p.row.preorder_release;
  await admin.from("book_purchases").update({ preorder_release: p.releaseDate }).eq("id", p.row.id);
  return p.releaseDate;
}

/** The author moved the release later: tell everyone waiting, who can keep their pre-order or cancel it. */
export async function notifyPreorderDateMoved(admin: SupabaseClient, projectId: string, newDate: string) {
  const rows = (await waitingPreorders(admin, projectId))?.filter((r) => r.preorder_release < newDate) || [];
  if (!rows.length) return 0;
  const queue: QueuedEmail[] = rows
    .filter((r) => r.buyer_email.includes("@"))
    .map((r) => {
      const mail = renderEmail({
        heading: `${r.title} has a new release date`,
        paragraphs: [
          `The author moved ${r.title} from ${longDay(r.preorder_release)} to ${longDay(newDate)}.`,
          `You can keep your pre-order for the new date, or cancel it for a full refund. If you do nothing and it isn't out by ${longDay(addDays(r.preorder_release, PREORDER_GRACE_DAYS))}, we refund you automatically.`,
        ],
        button: { label: "Keep or cancel", url: appUrl(`/purchase/${r.download_token}`) },
      });
      return { to: r.buyer_email, subject: `New release date for ${r.title}`, html: mail.html, text: mail.text };
    });
  if (queue.length) {
    await enqueueEmails(admin, queue);
    await processEmailQueue(admin, { timeBudgetMs: 15_000 }).catch(() => null);
  }
  return queue.length;
}

/**
 * Daily: deliver pre-orders for books that are out (a safety net for "mark out now"), refund the ones that are
 * too late, and remind authors on release day and a week before refunds start.
 */
export async function sweepPreorders(admin: SupabaseClient, opts: { timeBudgetMs?: number } = {}) {
  const stopAt = Date.now() + (opts.timeBudgetMs ?? 10_000);
  const { data, error } = await admin.from("book_purchases").select(COLS).eq("status", "paid").not("preorder_release", "is", null).is("delivered_at", null).limit(2000);
  if (error || !data?.length) return { delivered: 0, refunded: 0 };
  const rows = data as Row[];
  const ids = [...new Set(rows.map((r) => r.project_id))];
  const { data: projects } = await admin.from("projects").select("id, title, published").in("id", ids);
  const byId = new Map((projects || []).map((p) => [p.id as string, p]));
  const day = today();
  let delivered = 0;
  let refunded = 0;
  for (const projectId of ids) {
    if (Date.now() > stopAt) break;
    const project = byId.get(projectId);
    const mine = rows.filter((r) => r.project_id === projectId);
    if (project?.published) {
      delivered += await deliverPreorders(admin, projectId).catch(() => 0);
      continue;
    }
    for (const r of mine) {
      if (addDays(r.preorder_release, PREORDER_GRACE_DAYS) >= day) continue;
      try {
        await refundPreorder(admin, r, "late");
        refunded += 1;
      } catch (e) {
        console.error("preorder refund failed", r.id, e);
      }
    }
    const dueToday = mine.filter((r) => r.preorder_release === day).length;
    const refundSoon = mine.filter((r) => addDays(r.preorder_release, PREORDER_GRACE_DAYS - 7) === day).length;
    const title = (project?.title as string) || mine[0].title;
    if (dueToday) {
      await notifyUser(admin, mine[0].author_user_id, {
        type: "book_sale",
        title: `${dueToday} ${dueToday === 1 ? "reader is" : "readers are"} waiting for ${title} today`,
        body: "Mark the book out now to send their ebooks. If you need more time, move the release date and they'll be told.",
        href: `/project/${projectId}?tab=publish`,
      }).catch(() => null);
    }
    if (refundSoon) {
      await notifyUser(admin, mine[0].author_user_id, {
        type: "book_sale",
        title: `${refundSoon} ${refundSoon === 1 ? "pre-order" : "pre-orders"} of ${title} will be refunded in 7 days`,
        body: `Pre-orders still waiting ${PREORDER_GRACE_DAYS} days after their date are refunded automatically. Mark the book out now to deliver them instead.`,
        href: `/project/${projectId}?tab=publish`,
      }).catch(() => null);
    }
  }
  return { delivered, refunded };
}

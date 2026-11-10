import "server-only";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, sendEmail } from "@/lib/email";
import { optedInUserIds } from "@/lib/notifications";
import { appUrl } from "@/lib/stripe";

export type SubscriberSource = "opt_in" | "beta" | "arc";

const RESEND_AFTER_MS = 10 * 60 * 1000;

/**
 * A guest joining an author's list: send the confirmation email (at most every 10 minutes).
 * With freeBookTitle, the email says confirming also sends that free book.
 */
export async function requestGuestConfirmation(
  admin: SupabaseClient,
  opts: { authorUserId: string; email: string; name: string | null; cameFrom: string | null; releaseProjectId?: string | null; freeBookTitle?: string | null }
): Promise<{ status: "already" | "check_email" } | { error: string; http: number }> {
  const { authorUserId, email, name, cameFrom } = opts;
  const { data: existing, error: lookupErr } = await admin
    .from("author_subscribers")
    .select("id, confirmed_at, unsubscribed_at, confirm_sent_at")
    .eq("author_user_id", authorUserId)
    .eq("email", email)
    .maybeSingle();
  if (lookupErr) {
    const hint = lookupErr.message.includes("confirm")
      ? "Database needs an update. Run supabase/migration_launch_share.sql in the Supabase SQL editor."
      : lookupErr.message;
    return { error: hint, http: 500 };
  }
  if (existing?.confirmed_at && !existing.unsubscribed_at) {
    if (opts.releaseProjectId) await addReleaseAlert(admin, authorUserId, email, opts.releaseProjectId);
    return { status: "already" };
  }
  if (existing?.confirm_sent_at && Date.now() - Date.parse(existing.confirm_sent_at) < RESEND_AFTER_MS) {
    return { status: "check_email" };
  }

  const token = randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  const row = { author_user_id: authorUserId, email, display_name: name, sources: ["opt_in"], confirmed_at: null, confirm_token: token, confirm_sent_at: now };
  let { error } = existing
    ? await admin.from("author_subscribers").update({ confirm_token: token, confirm_sent_at: now, display_name: name, updated_at: now }).eq("id", existing.id)
    : await admin.from("author_subscribers").insert({ ...row, came_from: cameFrom });
  // Before migration_author_marketing.sql there is no came_from column
  if (error && !existing && /came_from/.test(error.message)) ({ error } = await admin.from("author_subscribers").insert(row));
  if (error) return { error: error.message, http: 500 };
  // Saved now and honored once they confirm
  if (opts.releaseProjectId) await addReleaseAlert(admin, authorUserId, email, opts.releaseProjectId);

  const { data: author } = await admin.from("profiles").select("display_name").eq("id", authorUserId).maybeSingle();
  const authorName = author?.display_name || "this author";
  const mail = renderEmail({
    heading: opts.freeBookTitle ? `Confirm to get ${opts.freeBookTitle} free` : `Confirm you want to join ${authorName}'s list`,
    paragraphs: [
      `Someone entered this email to get updates from ${authorName} on Novelist Writer: new books, advance copies, and release news.`,
      opts.freeBookTitle
        ? `Confirm below and your free copy of ${opts.freeBookTitle} is sent right away. If this wasn't you, ignore this email and nothing happens.`
        : "If that was you, confirm below. If not, ignore this email and nothing happens.",
    ],
    button: { label: opts.freeBookTitle ? "Yes, send my free book" : "Yes, add me", url: appUrl(`/subscribe/confirm?token=${token}`) },
  });
  const sent = await sendEmail({
    to: email,
    subject: opts.freeBookTitle ? `Confirm to get ${opts.freeBookTitle} free` : `Confirm: updates from ${authorName}`,
    text: mail.text,
    html: mail.html,
  });
  if (!sent.ok) return { error: "We couldn't send the confirmation email. Try again later.", http: 502 };
  return { status: "check_email" };
}

/**
 * Add an email to an author's list, or merge a new source into an existing row.
 * Auto sources (beta, arc) never undo an unsubscribe; only an explicit opt-in does.
 */
export async function upsertAuthorSubscriber(
  admin: SupabaseClient,
  opts: {
    authorUserId: string;
    email: string;
    displayName?: string | null;
    source: SubscriberSource;
    /** "Notify me when this book is out" */
    releaseProjectId?: string | null;
    /** Where the reader arrived from, for marketing results */
    cameFrom?: string | null;
  }
): Promise<void> {
  const email = opts.email.trim().toLowerCase();
  if (!email.includes("@") || !opts.authorUserId) return;
  const displayName = String(opts.displayName || "").trim().slice(0, 80) || null;
  const now = new Date().toISOString();

  try {
    const { data: existing } = await admin
      .from("author_subscribers")
      .select("id, sources, display_name, unsubscribed_at, confirmed_at")
      .eq("author_user_id", opts.authorUserId)
      .eq("email", email)
      .maybeSingle();

    if (!existing) {
      const row: Record<string, unknown> = {
        author_user_id: opts.authorUserId,
        email,
        display_name: displayName,
        sources: [opts.source],
        // Signed-in opt-ins and book joins are already verified accounts
        confirmed_at: now,
      };
      const { error } = await admin.from("author_subscribers").insert(opts.cameFrom ? { ...row, came_from: opts.cameFrom } : row);
      if (error && /came_from/.test(error.message)) await admin.from("author_subscribers").insert(row);
      if (opts.releaseProjectId) await addReleaseAlert(admin, opts.authorUserId, email, opts.releaseProjectId);
      return;
    }
    if (opts.releaseProjectId) await addReleaseAlert(admin, opts.authorUserId, email, opts.releaseProjectId);

    const sources: string[] = Array.isArray(existing.sources) ? existing.sources : [];
    const patch: Record<string, unknown> = {};
    if (!sources.includes(opts.source)) patch.sources = [...sources, opts.source];
    if (displayName && !existing.display_name) patch.display_name = displayName;
    if (opts.source === "opt_in" && existing.unsubscribed_at) {
      patch.unsubscribed_at = null;
      patch.subscribed_at = now;
    }
    if (!existing.confirmed_at) {
      patch.confirmed_at = now;
      patch.confirm_token = null;
    }
    if (!Object.keys(patch).length) return;
    patch.updated_at = now;
    await admin.from("author_subscribers").update(patch).eq("id", existing.id);
  } catch {
    /* list is best-effort until migration_platform_admin.sql is applied */
  }
}

/** Remember that this subscriber wants an email the day a specific book comes out. Best effort before the launch migration. */
export async function addReleaseAlert(admin: SupabaseClient, authorUserId: string, email: string, projectId: string) {
  try {
    const { data } = await admin
      .from("author_subscribers")
      .select("id, release_project_ids")
      .eq("author_user_id", authorUserId)
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    if (!data) return;
    const ids: string[] = Array.isArray(data.release_project_ids) ? data.release_project_ids : [];
    if (ids.includes(projectId)) return;
    await admin.from("author_subscribers").update({ release_project_ids: [...ids, projectId] }).eq("id", data.id);
  } catch {
    /* column missing before migration_launch_engine.sql */
  }
}

export async function setSubscriberOptOut(
  admin: SupabaseClient,
  opts: { authorUserId: string; email: string }
) {
  const email = opts.email.trim().toLowerCase();
  const now = new Date().toISOString();
  await admin
    .from("author_subscribers")
    .update({ unsubscribed_at: now, updated_at: now })
    .eq("author_user_id", opts.authorUserId)
    .eq("email", email);
}

export async function isSubscribed(
  admin: SupabaseClient,
  opts: { authorUserId: string; email: string | null | undefined }
): Promise<boolean> {
  const email = String(opts.email || "").trim().toLowerCase();
  if (!email.includes("@")) return false;
  const { data } = await admin
    .from("author_subscribers")
    .select("id, unsubscribed_at, confirmed_at")
    .eq("author_user_id", opts.authorUserId)
    .eq("email", email)
    .maybeSingle();
  return Boolean(data && !data.unsubscribed_at && data.confirmed_at);
}

export async function followAuthor(
  admin: SupabaseClient,
  opts: { readerUserId: string; authorUserId: string }
) {
  if (!opts.readerUserId || !opts.authorUserId || opts.readerUserId === opts.authorUserId) return;
  try {
    await admin.from("beta_author_follows").upsert(
      { reader_user_id: opts.readerUserId, author_user_id: opts.authorUserId },
      { onConflict: "reader_user_id,author_user_id", ignoreDuplicates: true }
    );
  } catch {
    /* non-fatal */
  }
}

/** Reader joined a book as beta or ARC: add to the author's list and follow the author. */
export async function joinAuthorAudience(
  admin: SupabaseClient,
  opts: {
    authorUserId: string;
    email: string;
    displayName?: string | null;
    readerUserId?: string | null;
    source: Exclude<SubscriberSource, "opt_in">;
  }
) {
  await upsertAuthorSubscriber(admin, opts);
  if (opts.readerUserId) {
    await followAuthor(admin, { readerUserId: opts.readerUserId, authorUserId: opts.authorUserId });
  }
}

export async function authorContact(
  admin: SupabaseClient,
  authorUserId: string
): Promise<{ name: string; email: string | null }> {
  const { data } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", authorUserId)
    .maybeSingle();
  return { name: data?.display_name || "An author", email: data?.email || null };
}

/** New beta or ARC opened: in-app notice plus email to every follower. */
export async function notifyFollowersOfOpening(
  admin: SupabaseClient,
  opts: {
    authorUserId: string;
    projectId: string;
    projectTitle: string;
    kind: "beta" | "arc";
    rerelease?: boolean;
  }
) {
  const { data: followers } = await admin
    .from("beta_author_follows")
    .select("reader_user_id")
    .eq("author_user_id", opts.authorUserId);
  const readerIds = [
    ...new Set((followers || []).map((f) => f.reader_user_id).filter(Boolean)),
  ] as string[];
  if (!readerIds.length) return;

  const author = await authorContact(admin, opts.authorUserId);
  const path = opts.kind === "arc" ? `/arc/book/${opts.projectId}` : `/beta/book/${opts.projectId}`;
  const title =
    opts.kind === "arc"
      ? `${author.name} opened ARC copies`
      : opts.rerelease
        ? `${author.name} reopened a beta`
        : `${author.name} posted a new beta`;
  const type =
    opts.kind === "arc" ? "author_new_arc" : opts.rerelease ? "author_rerelease" : "author_new_book";

  await admin.from("beta_notifications").insert(
    readerIds.map((id) => ({
      user_id: id,
      type,
      title,
      body: opts.projectTitle,
      href: path,
      meta: { projectId: opts.projectId, authorUserId: opts.authorUserId },
    }))
  );

  // In-app goes to every follower; email only to those who agreed to notification emails
  const emailIds = [...(await optedInUserIds(admin, readerIds))];
  if (!emailIds.length) return;
  const { data: profiles } = await admin.from("profiles").select("email").in("id", emailIds);
  const what = opts.kind === "arc" ? "advance reader copies" : "beta readers";
  const mail = renderEmail({
    heading: title,
    paragraphs: [
      `${author.name} is looking for ${what} for "${opts.projectTitle}".`,
      "You're getting this because you follow this author on Novelist Writer.",
    ],
    button: { label: opts.kind === "arc" ? "Request a copy" : "Apply to read", url: appUrl(path) },
    footer: "To stop hearing about this author, unfollow them from your reader dashboard.",
    notification: true,
  });
  for (const p of profiles || []) {
    if (!p.email) continue;
    await sendEmail({
      to: p.email,
      subject: `${title}: ${opts.projectTitle}`,
      text: mail.text,
      html: mail.html,
      replyTo: author.email,
    });
  }
}

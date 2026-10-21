import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, sendEmail } from "@/lib/email";
import { optedInUserIds } from "@/lib/notifications";
import { appUrl } from "@/lib/stripe";

export type SubscriberSource = "opt_in" | "beta" | "arc";

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
      await admin.from("author_subscribers").insert({
        author_user_id: opts.authorUserId,
        email,
        display_name: displayName,
        sources: [opts.source],
        // Signed-in opt-ins and book joins are already verified accounts
        confirmed_at: now,
      });
      return;
    }

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

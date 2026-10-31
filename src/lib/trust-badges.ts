import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiActionCounts, type AiActionCount } from "@/lib/ai-usage";
import { computeWritingRecord } from "@/lib/writing-record";
import { bookPath } from "@/lib/handles";

export type TrustBadges = {
  /** Account-wide AI switch is off since this date */
  aiOffSince: string | null;
  /** No AI run has ever been recorded on this book */
  noAiOnBook: boolean;
  /** AI action names run on this book; only present when the author chose to show them */
  aiActions?: AiActionCount[] | null;
};

/** Account badge plus per-book "No AI used" for any number of the author's books. */
export async function loadTrustBadges(
  admin: SupabaseClient,
  authorUserId: string,
  projectIds: string[]
): Promise<{ aiOffSince: string | null; noAiProjectIds: Set<string> }> {
  const [{ data: profile }, { data: projects }, { data: jobs }] = await Promise.all([
    admin
      .from("profiles")
      .select("ai_disabled, ai_disabled_since")
      .eq("id", authorUserId)
      .maybeSingle(),
    projectIds.length
      ? admin.from("projects").select("id, ai_used_at").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; ai_used_at: string | null }[] }),
    projectIds.length
      ? admin.from("ai_jobs").select("project_id").in("project_id", projectIds).limit(2000)
      : Promise.resolve({ data: [] as { project_id: string }[] }),
  ]);
  const usedAi = new Set((jobs || []).map((j) => j.project_id));
  // A missing ai_used_at column (before the migration) leaves projects null: show no badge
  const noAiProjectIds = new Set(
    (projects || []).filter((p) => !p.ai_used_at && !usedAi.has(p.id)).map((p) => p.id)
  );
  return {
    aiOffSince: profile?.ai_disabled ? profile.ai_disabled_since || null : null,
    noAiProjectIds,
  };
}

export async function trustBadgesForBook(
  admin: SupabaseClient,
  authorUserId: string,
  projectId: string
): Promise<TrustBadges> {
  const { aiOffSince, noAiProjectIds } = await loadTrustBadges(admin, authorUserId, [projectId]);
  const noAiOnBook = noAiProjectIds.has(projectId);
  if (noAiOnBook) return { aiOffSince, noAiOnBook };

  const { data: proj } = await admin
    .from("projects")
    .select("id, ai_disclosure_public, ai_deleted_job_counts")
    .eq("id", projectId)
    .maybeSingle();
  if (!proj?.ai_disclosure_public) return { aiOffSince, noAiOnBook };
  const counts = await aiActionCounts(admin, [proj]);
  return { aiOffSince, noAiOnBook, aiActions: counts.get(projectId) || [] };
}

/** Process numbers from the writing record that an author can choose to show readers. */
export type RecordSummary = {
  badge: "written_here" | "before_records" | null;
  typedPercent: number;
  sessions: number;
  activeDays: number;
  /** Full record page, only when the author has also made it public */
  recordHref: string | null;
};

export type ReaderTrust = { trust: TrustBadges; record: RecordSummary | null };

type ReaderFlags = {
  id: string;
  slug?: string | null;
  reader_show_badges?: boolean | null;
  reader_show_record?: boolean | null;
  record_public?: boolean | null;
  ai_disclosure_public?: boolean | null;
  ai_deleted_job_counts?: unknown;
};

/**
 * What readers see on Beta and ARC listings and book pages, following each book's
 * reader_show_badges / reader_show_record choices.
 */
export async function readerTrustForBooks(
  admin: SupabaseClient,
  books: { id: string; user_id: string }[]
): Promise<Map<string, ReaderTrust>> {
  const out = new Map<string, ReaderTrust>();
  if (!books.length) return out;
  const ids = [...new Set(books.map((b) => b.id))];

  let flags: ReaderFlags[] = [];
  const full = await admin
    .from("projects")
    .select("id, slug, reader_show_badges, reader_show_record, record_public, ai_disclosure_public, ai_deleted_job_counts")
    .in("id", ids);
  if (!full.error) flags = (full.data || []) as ReaderFlags[];
  else {
    // Before migration_reader_badges.sql: badges on, record off
    const legacy = await admin.from("projects").select("id, ai_disclosure_public, ai_deleted_job_counts").in("id", ids);
    flags = (legacy.data || []) as ReaderFlags[];
  }
  const flagById = new Map(flags.map((f) => [f.id, f]));
  const showBadges = (id: string) => flagById.get(id)?.reader_show_badges !== false;
  const showRecord = (id: string) => flagById.get(id)?.reader_show_record === true;

  const byAuthor = new Map<string, string[]>();
  for (const b of books) byAuthor.set(b.user_id, [...(byAuthor.get(b.user_id) || []), b.id]);
  const authorBadges = new Map(
    await Promise.all(
      [...byAuthor].map(async ([authorId, projectIds]) => [authorId, await loadTrustBadges(admin, authorId, projectIds)] as const)
    )
  );

  const disclosed = ids.filter((id) => showBadges(id) && flagById.get(id)?.ai_disclosure_public);
  const actions = disclosed.length
    ? await aiActionCounts(
        admin,
        disclosed.map((id) => ({ id, ai_deleted_job_counts: flagById.get(id)?.ai_deleted_job_counts }))
      )
    : new Map<string, AiActionCount[]>();

  const recordIds = ids.filter(showRecord);
  const records = new Map(
    await Promise.all(recordIds.map(async (id) => [id, await computeWritingRecord(admin, id)] as const))
  );
  const linkAuthors = [
    ...new Set(books.filter((b) => records.has(b.id) && flagById.get(b.id)?.record_public).map((b) => b.user_id)),
  ];
  const { data: handles } = linkAuthors.length
    ? await admin.from("profiles").select("id, handle").in("id", linkAuthors)
    : { data: [] as { id: string; handle: string | null }[] };
  const handleById = new Map((handles || []).map((h) => [h.id, h.handle as string | null]));

  for (const b of books) {
    const author = authorBadges.get(b.user_id);
    const noAiOnBook = Boolean(author?.noAiProjectIds.has(b.id));
    const trust: TrustBadges = showBadges(b.id)
      ? {
          aiOffSince: author?.aiOffSince || null,
          noAiOnBook,
          ...(noAiOnBook ? {} : { aiActions: actions.get(b.id) || null }),
        }
      : { aiOffSince: null, noAiOnBook: false };

    const rec = records.get(b.id);
    let record: RecordSummary | null = null;
    if (rec && (rec.badge || rec.sessions > 0)) {
      const f = flagById.get(b.id);
      const handle = handleById.get(b.user_id);
      record = {
        badge: rec.badge,
        typedPercent: Math.round(rec.typedShare * 100),
        sessions: rec.sessions,
        activeDays: rec.activeDays,
        recordHref: f?.record_public && handle && f.slug ? `${bookPath(handle, f.slug)}/record` : null,
      };
    }
    out.set(b.id, { trust, record });
  }
  return out;
}

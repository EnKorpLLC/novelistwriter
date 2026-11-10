import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeWritingRecord } from "@/lib/writing-record";
import { trustBadgesForBook } from "@/lib/trust-badges";
import { authorSitePublic } from "@/lib/credits";
import { authorPath, bookPath } from "@/lib/handles";
import { coverPublicUrl, projectCoverPath } from "@/lib/cover";
import { appUrl } from "@/lib/stripe";

export const VERIFY_MIGRATION_HINT = "Database needs an update. Run supabase/migration_verify_badge.sql in the Supabase SQL editor.";

// No 0/O, 1/I/L, so codes survive being read aloud or typed from a paperback
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newVerifyCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** NW-ABCD-EFGH for people; the 8 characters for URLs and the database. */
export function formatVerifyCode(code: string) {
  return `NW-${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

/** Accepts "NW-ABCD-EFGH", "abcd efgh", or a pasted verify URL. */
export function parseVerifyCode(input: string): string | null {
  const raw = String(input || "").trim().toUpperCase().split("/").filter(Boolean).pop() || "";
  let clean = raw.replace(/[^A-Z0-9]/g, "");
  if (clean.length === 10 && clean.startsWith("NW")) clean = clean.slice(2);
  return clean.length === 8 && [...clean].every((c) => ALPHABET.includes(c)) ? clean : null;
}

export function verifyUrl(code: string) {
  return appUrl(`/verify/${code}`);
}

/** The book's code, made on first use. */
export async function ensureVerifyCode(admin: SupabaseClient, projectId: string): Promise<string> {
  const { data, error } = await admin.from("projects").select("verify_code").eq("id", projectId).maybeSingle();
  if (error) throw new Error(VERIFY_MIGRATION_HINT);
  if (data?.verify_code) return data.verify_code as string;
  for (let i = 0; i < 5; i++) {
    const code = newVerifyCode();
    const { error: upErr } = await admin.from("projects").update({ verify_code: code }).eq("id", projectId).is("verify_code", null);
    if (!upErr) {
      const { data: again } = await admin.from("projects").select("verify_code").eq("id", projectId).maybeSingle();
      if (again?.verify_code) return again.verify_code as string;
    }
  }
  throw new Error("Could not make a verification code. Try again.");
}

export type VerifyStatus = "human_written" | "written_here" | "record";

export type Verification = {
  code: string;
  display: string;
  url: string;
  title: string;
  author: string;
  /** Only when the author's site is public */
  authorUrl: string | null;
  bookUrl: string | null;
  recordUrl: string | null;
  coverUrl: string | null;
  status: VerifyStatus;
  /** What the badge says */
  label: string;
  writtenHere: boolean;
  noAiOnBook: boolean;
  aiOffSince: string | null;
  typedPercent: number;
  pastedPercent: number;
  importedPercent: number;
  beforeRecordsPercent: number;
  currentWords: number;
  recordedWords: number;
  sessions: number;
  activeDays: number;
  spanDays: number;
  revisions: number;
  firstSession: string | null;
  lastSession: string | null;
  checkedAt: string;
};

export function badgeLabel(status: VerifyStatus, typedPercent: number) {
  if (status === "human_written") return "Verified human-written";
  if (status === "written_here") return "Written in Novelist Writer";
  return `Writing record · ${typedPercent}% typed`;
}

/** For public routes: a bad code, a missing book, or an unreachable database all mean "not verified", never an error. */
export async function findVerification(raw: string): Promise<{ code: string | null; v: Verification | null }> {
  const code = parseVerifyCode(raw);
  if (!code) return { code: null, v: null };
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    return { code, v: await loadVerification(createServiceClient(), code) };
  } catch {
    return { code, v: null };
  }
}

/** Numbers from the writing record, only for books whose author turned verification on. Never any text. */
export async function loadVerification(admin: SupabaseClient, code: string): Promise<Verification | null> {
  const { data: p, error } = await admin
    .from("projects")
    .select("id, user_id, title, slug, cover_path, metadata, updated_at, verify_code, verify_public, record_public")
    .eq("verify_code", code)
    .maybeSingle();
  if (error || !p || !p.verify_public) return null;
  const [record, trust, { data: profile }, sitePublic] = await Promise.all([
    computeWritingRecord(admin, p.id),
    trustBadgesForBook(admin, p.user_id, p.id),
    admin.from("profiles").select("display_name, handle").eq("id", p.user_id).maybeSingle(),
    authorSitePublic(p.user_id).catch(() => false),
  ]);
  const total = Math.max(1, record.currentWords);
  const pct = (n: number) => Math.round((n / total) * 100);
  const writtenHere = record.badge === "written_here";
  const status: VerifyStatus = writtenHere && trust.noAiOnBook ? "human_written" : writtenHere ? "written_here" : "record";
  const typedPercent = Math.round(record.typedShare * 100);
  const handle = sitePublic ? (profile?.handle as string | null) : null;
  return {
    code,
    display: formatVerifyCode(code),
    url: verifyUrl(code),
    title: (p.title as string) || "Untitled",
    author: (profile?.display_name as string) || "Author",
    authorUrl: handle ? appUrl(authorPath(handle)) : null,
    bookUrl: handle && p.slug ? appUrl(bookPath(handle, p.slug)) : null,
    recordUrl: handle && p.slug && p.record_public ? appUrl(`${bookPath(handle, p.slug)}/record`) : null,
    coverUrl: coverPublicUrl(projectCoverPath(p), p.updated_at ? Date.parse(p.updated_at) : undefined),
    status,
    label: badgeLabel(status, typedPercent),
    writtenHere,
    noAiOnBook: trust.noAiOnBook,
    aiOffSince: trust.aiOffSince,
    typedPercent,
    pastedPercent: pct(record.pastedWords),
    importedPercent: pct(record.importedWords),
    beforeRecordsPercent: pct(record.beforeRecordsWords),
    currentWords: record.currentWords,
    recordedWords: record.recordedWords,
    sessions: record.sessions,
    activeDays: record.activeDays,
    spanDays: record.spanDays,
    revisions: record.revisions,
    firstSession: record.firstAt,
    lastSession: record.lastAt,
    checkedAt: new Date().toISOString(),
  };
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getLaunchBook, resolveAuthor } from "@/lib/public-site";
import { trustBadgesForBook } from "@/lib/trust-badges";
import { imageAsDataUrl, renderShareImage } from "@/lib/og-image";
import { computeWritingRecord } from "@/lib/writing-record";

const KICKER = {
  published: "Out now",
  arc: "Advance copies open",
  beta: "Beta readers wanted",
  coming_soon: "Coming soon",
} as const;

export async function bookShareImage(handle: string, slug: string, size: { width: number; height: number }) {
  const admin = createServiceClient();
  const author = await resolveAuthor(admin, handle);
  const book = author ? await getLaunchBook(admin, author.userId, slug) : null;
  if (!author || !book) {
    return renderShareImage({ ...size, title: "Novelist Writer", subtitle: "Write it yourself. Prove it.", kicker: "", image: null });
  }
  const [cover, trust, { data: recordFlag }] = await Promise.all([
    imageAsDataUrl(book.coverUrl),
    trustBadgesForBook(admin, author.userId, book.id),
    admin.from("projects").select("record_public").eq("id", book.id).maybeSingle(),
  ]);
  const record = recordFlag?.record_public ? await computeWritingRecord(admin, book.id) : null;
  return renderShareImage({
    ...size,
    title: book.title,
    subtitle: `by ${author.name}`,
    kicker: KICKER[book.stage],
    badge:
      record?.badge === "written_here"
        ? "Written in Novelist Writer"
        : trust.noAiOnBook
          ? "No AI used on this book"
          : null,
    image: cover,
  });
}

import { NextResponse } from "next/server";
import { findVerification } from "@/lib/verify";
import { appUrl } from "@/lib/stripe";

/** Free, read-only, open to any site: look up a book's verification code and get its writing record summary. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { v } = await findVerification((await params).code);
  if (!v) {
    return NextResponse.json(
      { verified: false, error: "No verification found for that code. The code may be wrong, or the author turned verification off." },
      { status: 404, headers: { ...CORS, "Cache-Control": "public, s-maxage=300" } }
    );
  }
  return NextResponse.json(
    {
      verified: true,
      code: v.display,
      url: v.url,
      book: { title: v.title, author: v.author, url: v.bookUrl, authorUrl: v.authorUrl, coverUrl: v.coverUrl },
      status: v.status,
      label: v.label,
      writtenInNovelistWriter: v.writtenHere,
      noAiUsedOnBook: v.noAiOnBook,
      aiToolsOffSince: v.aiOffSince,
      record: {
        typedPercent: v.typedPercent,
        pastedPercent: v.pastedPercent,
        importedPercent: v.importedPercent,
        beforeRecordsPercent: v.beforeRecordsPercent,
        words: v.currentWords,
        wordsWrittenHere: v.recordedWords,
        sessions: v.sessions,
        activeDays: v.activeDays,
        spanDays: v.spanDays,
        revisions: v.revisions,
        firstSession: v.firstSession,
        lastSession: v.lastSession,
        fullRecordUrl: v.recordUrl,
      },
      audiobook: v.audiobook
        ? { hours: Math.round(v.audiobook.hours * 10) / 10, recordedInNovelistWriter: v.audiobook.recordedHere, humanNarratedStatedByAuthor: v.audiobook.humanNarrated }
        : null,
      standard: appUrl("/human-authorship-standard"),
      checkedAt: v.checkedAt,
    },
    { headers: { ...CORS, "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}

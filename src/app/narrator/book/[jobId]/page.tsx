import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { jobFromRow } from "@/lib/narration-access";
import { AudioStudio } from "@/components/AudioStudio";
import { NarrationAgreement } from "@/components/NarrationAgreement";
import type { Chapter } from "@/lib/types";

export const metadata = { title: "Narration studio", robots: { index: false, follow: false } };

/** The narrator's view of one book: its script, the recording studio, and the agreement. Nothing else of the author's. */
export default async function NarratorBookPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/narrator/book/${jobId}`);
  const admin = createServiceClient();
  const { data: row } = await admin.from("narrator_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!row || row.narrator_id !== user.id || row.status !== "active") notFound();
  const job = jobFromRow(row);
  const [{ data: project }, { data: chapters }, { data: author }] = await Promise.all([
    admin.from("projects").select("id, title, cover_path").eq("id", job.projectId).maybeSingle(),
    // Only what narration needs: titles and the text to read
    admin.from("chapters").select("id, project_id, title, sort_order, content_text").eq("project_id", job.projectId).order("sort_order"),
    admin.from("profiles").select("display_name").eq("id", job.authorId).maybeSingle(),
  ]);
  if (!project) notFound();
  const book = (project.title as string) || "Untitled";

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="font-ui flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm">
        <span className="min-w-0">
          <Link href="/narrator" className="text-accent hover:underline">
            ← Narrator dashboard
          </Link>
          <span className="ml-3 font-display text-lg">{book}</span>
          <span className="ml-2 text-muted">by {(author?.display_name as string) || "the author"}</span>
        </span>
        <details className="relative">
          <summary className="cursor-pointer text-accent">Your agreement</summary>
          <div className="absolute right-0 z-30 mt-2 max-h-[70vh] w-[min(36rem,90vw)] overflow-y-auto border border-line bg-paper p-4 shadow-lg">
            <NarrationAgreement terms={job.terms} book={book} author={(author?.display_name as string) || "The author"} narrator={job.narratorName || "You"} viewer="narrator" />
          </div>
        </details>
      </header>
      <AudioStudio projectId={job.projectId} chapters={(chapters || []) as unknown as Chapter[]} bookTitle={book} coverPath={(project.cover_path as string) || null} />
    </div>
  );
}

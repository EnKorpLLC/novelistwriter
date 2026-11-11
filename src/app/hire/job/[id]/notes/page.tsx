import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ManuscriptNotes } from "@/components/ManuscriptNotes";

export const metadata = { title: "Editor notes | Novelist Writer", robots: { index: false, follow: false } };

export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/hire/job/${id}/notes`);
  return (
    <div className="min-h-screen">
      <header className="font-ui flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
        <Link href={`/hire/job/${id}`} className="font-display text-xl">
          Novelist Writer
        </Link>
        <Link href={`/hire/job/${id}`} className="text-sm text-accent hover:underline">
          Back to the job
        </Link>
      </header>
      <main className="font-ui mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-display text-3xl">Notes on the manuscript</h1>
        <ManuscriptNotes jobId={id} />
      </main>
    </div>
  );
}

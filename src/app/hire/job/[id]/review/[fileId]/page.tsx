import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewEdits } from "@/components/ReviewEdits";

export const metadata = { title: "Review edits | Novelist Writer", robots: { index: false, follow: false } };

export default async function ReviewEditsPage({ params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/hire/job/${id}/review/${fileId}`);
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
      <main className="font-ui mx-auto max-w-3xl px-6 py-8">
        <ReviewEdits jobId={id} fileId={fileId} />
      </main>
    </div>
  );
}

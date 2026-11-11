import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readAlongAccess, readAlongBook } from "@/lib/read-along";
import { ReadAlong } from "@/components/ReadAlong";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Read and listen | Novelist Writer", robots: { index: false, follow: false } };

/** For a reader who bought both the ebook and the audiobook: read and listen at the same spot. */
export default async function ReadAlongPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createServiceClient();
  const access = await readAlongAccess(admin, token).catch(() => null);
  if (!access) notFound();
  const [chapters, { data: project }] = await Promise.all([readAlongBook(admin, access.projectId), admin.from("projects").select("title, user_id").eq("id", access.projectId).maybeSingle()]);
  const { data: author } = project ? await admin.from("profiles").select("display_name").eq("id", project.user_id).maybeSingle() : { data: null };
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const signedIn = Boolean(user && (user.id === access.buyerUserId || (user.email || "").toLowerCase() === access.buyerEmail));

  return (
    <div className="min-h-screen">
      <header className="font-ui flex items-center justify-between border-b border-line px-4 py-3 text-sm">
        <Link href={`/purchase/${access.audioToken}`} className="text-accent hover:underline">
          ← Your audiobook
        </Link>
        <Link href={`/purchase/${access.ebookToken}`} className="text-muted hover:underline">
          Your ebook
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-6">
        <ReadAlong
          projectId={access.projectId}
          storageKey={access.audioToken}
          chapters={chapters}
          signedIn={signedIn}
          title={(project?.title as string) || "Your book"}
          author={(author?.display_name as string) || ""}
        />
      </main>
    </div>
  );
}

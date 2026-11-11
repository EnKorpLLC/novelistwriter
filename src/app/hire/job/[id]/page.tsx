import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchProfileRoles } from "@/lib/beta-platform";
import { MarketJob } from "@/components/MarketJob";
import { SiteFeedbackButton } from "@/components/SiteFeedbackButton";

export const metadata = { title: "Job | Novelist Writer", robots: { index: false, follow: false } };

export default async function MarketJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/hire/job/${id}`);
  const roles = await fetchProfileRoles(supabase, user.id);
  return (
    <div className="min-h-screen">
      <header className="font-ui flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
        <Link href={roles.is_author ? "/dashboard/hire" : "/pro"} className="font-display text-xl">
          Novelist Writer
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {roles.is_author && (
            <Link href="/dashboard/hire" className="text-accent hover:underline">
              Your hiring
            </Link>
          )}
          {roles.is_pro && (
            <Link href="/pro" className="text-accent hover:underline">
              Pro dashboard
            </Link>
          )}
          <SiteFeedbackButton />
        </div>
      </header>
      <main className="font-ui mx-auto max-w-3xl px-6 py-8">
        <MarketJob jobId={id} />
      </main>
    </div>
  );
}

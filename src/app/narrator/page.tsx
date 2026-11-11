import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchProfileRoles } from "@/lib/beta-platform";
import { NarratorDashboard } from "@/components/NarratorDashboard";
import { SiteFeedbackButton } from "@/components/SiteFeedbackButton";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: "Narrator dashboard", robots: { index: false, follow: false } };

export default async function NarratorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/narrator");
  const roles = await fetchProfileRoles(supabase, user.id);

  return (
    <div className="min-h-screen">
      <header className="font-ui flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/narrator" className="font-display text-xl">
          Novelist Writer
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {roles.is_author && (
            <Link href="/dashboard" className="text-accent hover:underline">
              Author dashboard
            </Link>
          )}
          {roles.is_beta_reader && (
            <Link href="/beta/dashboard" className="text-accent hover:underline">
              Reader dashboard
            </Link>
          )}
          <Link href="/pro" className="text-accent hover:underline">
            {roles.is_pro ? "Pro profile" : "Get listed for authors to hire"}
          </Link>
          <SiteFeedbackButton />
          <SignOutButton />
        </div>
      </header>
      <main className="font-ui mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-3xl">Narrator dashboard</h1>
        <p className="mt-1 text-sm text-muted">Your narration account is free. Authors invite you to their books; you record with the script on screen, and your recordings stay on your computer.{" "}
          <Link href="/help/getting-started-narrators" className="text-accent underline">
            New here? Start here
          </Link>
        </p>
        <NarratorDashboard />
      </main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchProfileRoles } from "@/lib/beta-platform";
import { ProDashboard } from "@/components/ProDashboard";
import { SiteFeedbackButton } from "@/components/SiteFeedbackButton";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: "Pro dashboard", robots: { index: false, follow: false } };

export default async function ProPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/pro");
  const roles = await fetchProfileRoles(supabase, user.id);

  return (
    <div className="min-h-screen">
      <header className="font-ui flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/pro" className="font-display text-xl">
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
          {roles.is_narrator && (
            <Link href="/narrator" className="text-accent hover:underline">
              Narrator dashboard
            </Link>
          )}
          <SiteFeedbackButton />
          <SignOutButton />
        </div>
      </header>
      <main className="font-ui mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-3xl">Pro dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Your profile for authors who want to hire an editor, artist, or narrator. A pro account is free; authors pay our fee on top of your price.{" "}
          <Link href="/help/getting-started-pros" className="underline">
            How it works
          </Link>
        </p>
        <ProDashboard />
      </main>
    </div>
  );
}

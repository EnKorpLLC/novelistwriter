import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { emailConfigured } from "@/lib/email";
import AdminClient from "./AdminClient";

export const metadata = { title: "Admin — Novelist Writer" };

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!(await isPlatformAdmin(supabase, user))) redirect("/dashboard");

  return <AdminClient emailReady={emailConfigured()} />;
}

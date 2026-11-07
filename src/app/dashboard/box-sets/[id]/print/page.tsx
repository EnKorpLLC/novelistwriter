import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { loadBoxSetInput, type BoxSetRow } from "@/lib/book/box-set";
import { PrintStudio } from "@/components/PrintStudio";

export const metadata = { title: "Box set print layout — Novelist Writer", robots: { index: false } };

export default async function BoxSetPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/box-sets/${id}/print`);

  const { data: set } = await supabase.from("box_sets").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!set) notFound();
  if (!set.project_ids?.length) redirect("/dashboard/box-sets");

  const [studio, input] = await Promise.all([userHasStudio(user.id), loadBoxSetInput(createServiceClient(), set as BoxSetRow)]);

  return (
    <PrintStudio
      projectId={id}
      title={input.title}
      subtitle={input.subtitle}
      authorName={input.author}
      formatSettings={input.format}
      bookDetails={input.details}
      migrationNeeded={false}
      chapters={input.chapters}
      matter={input.matter}
      extras={input.extras}
      pro={studio}
      persist={false}
      backHref="/dashboard/box-sets"
      backLabel="Box sets"
    />
  );
}

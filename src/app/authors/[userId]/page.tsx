import { notFound, permanentRedirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureHandle } from "@/lib/public-site";
import { authorPath } from "@/lib/handles";

export const dynamic = "force-dynamic";

/** Old author URL; the author site now lives at /a/[handle]. */
export default async function OldAuthorPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  const handle = await ensureHandle(createServiceClient(), userId);
  if (!handle) notFound();
  permanentRedirect(authorPath(handle));
}

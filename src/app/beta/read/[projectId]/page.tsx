import { Suspense } from "react";
import { BetaAuthReaderClient } from "@/components/BetaAuthReaderClient";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ chapter?: string }>;
}) {
  const { projectId } = await params;
  const { chapter } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <BetaAuthReaderClient projectId={projectId} initialChapterId={chapter} />
      </Suspense>
    </div>
  );
}

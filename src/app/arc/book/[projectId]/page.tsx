import { ArcBookClient } from "@/components/ArcBookClient";

export const metadata = { title: "Advance reader copy — Novelist Writer" };

export default async function ArcBookPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <ArcBookClient projectId={projectId} />
    </div>
  );
}

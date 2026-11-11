import { PublicHeader } from "@/components/PublicHeader";
import { NarratorInvite } from "@/components/NarratorInvite";

export const metadata = { title: "Narration invite", robots: { index: false, follow: false } };

export default async function NarrateInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <NarratorInvite token={token} />
    </div>
  );
}

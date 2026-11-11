import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { MarketInvite } from "@/components/MarketInvite";

export const metadata: Metadata = { title: "A request for a quote | Novelist Writer", robots: { index: false, follow: false } };

export default async function MarketInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <MarketInvite token={token} />
      <PublicFooter />
    </div>
  );
}

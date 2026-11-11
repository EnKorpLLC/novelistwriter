import type { Metadata } from "next";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { ProJoin } from "@/components/ProJoin";

export const metadata: Metadata = { title: "Join as a founding pro | Novelist Writer", robots: { index: false, follow: true } };

export default async function ProJoinPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <ProJoin invite={invite && /^[\w-]{6,40}$/.test(invite) ? invite : null} />
      <PublicFooter />
    </div>
  );
}

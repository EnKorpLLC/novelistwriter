import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { buildPurchaseEpub } from "@/lib/direct-sales";

export const maxDuration = 120;

/** The buyer's ebook. The link in their receipt is the key, so it works without signing in, forever. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,64}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const { data: purchase } = await admin.from("book_purchases").select("*").eq("download_token", token).maybeSingle();
  // An audiobook purchase is a different product; its link doesn't open the ebook
  if (!purchase || purchase.format === "audiobook") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (purchase.status !== "paid") return NextResponse.json({ error: "This purchase was refunded." }, { status: 410 });
  try {
    const { buf, fileName } = await buildPurchaseEpub(admin, purchase);
    await admin.from("book_purchases").update({ downloads: (purchase.downloads || 0) + 1 }).eq("id", purchase.id);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/epub+zip", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not build your ebook" }, { status: 500 });
  }
}

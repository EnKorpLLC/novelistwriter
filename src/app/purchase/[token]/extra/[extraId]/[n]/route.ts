import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { signedDownloadUrl } from "@/lib/r2";
import { getExtra, purchaseUnlocks } from "@/lib/digital-extras";

/** One file of an extra: checks the buyer's link unlocks it, then hands over a short-lived download link. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; extraId: string; n: string }> }) {
  const { token, extraId, n } = await params;
  if (!/^[\w-]{20,64}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createServiceClient();
  const [{ data: purchase }, extra] = await Promise.all([admin.from("book_purchases").select("*").eq("download_token", token).maybeSingle(), getExtra(admin, extraId)]);
  if (!purchase || !extra || !purchaseUnlocks(purchase, extra)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = extra.files[Number(n) - 1];
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(await signedDownloadUrl(file.key, 600, file.name), 302);
}

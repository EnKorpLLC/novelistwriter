import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { setSubscriberOptOut } from "@/lib/audience";
import { verifyUnsubscribe } from "@/lib/email-queue";

/** One-click unsubscribe (mail apps) and the confirm button on /subscribe/unsubscribe. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let a = url.searchParams.get("a") || "";
  let e = url.searchParams.get("e") || "";
  let t = url.searchParams.get("t") || "";
  const type = req.headers.get("content-type") || "";
  if (!a && type.includes("form")) {
    const form = await req.formData();
    a = String(form.get("a") || "");
    e = String(form.get("e") || "");
    t = String(form.get("t") || "");
  }
  if (!a || !e || !verifyUnsubscribe(a, e, t)) return NextResponse.json({ error: "This unsubscribe link isn't valid." }, { status: 400 });
  await setSubscriberOptOut(createServiceClient(), { authorUserId: a, email: e });
  if (type.includes("form")) return NextResponse.redirect(new URL(`/subscribe/unsubscribe?done=1`, url.origin), 303);
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.redirect(new URL(`/subscribe/unsubscribe?${url.searchParams.toString()}`, url.origin));
}

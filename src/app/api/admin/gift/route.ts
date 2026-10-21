import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { giftPassDays, MAX_GIFT_DAYS } from "@/lib/studio-pass";
import { reconcileAuthorAccess } from "@/lib/studio-access";
import { emailConsentFor } from "@/lib/notifications";
import { renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/stripe";

export const maxDuration = 60;

const CHUNK = 20;

/** Gift Studio days (no AI credits) to one account or to every author account. */
export async function POST(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const body = (await req.json()) as {
    userId?: string;
    all?: boolean;
    days?: number;
    startNow?: boolean;
    note?: string;
  };
  const days = Math.round(Number(body.days));
  if (!Number.isFinite(days) || days < 1 || days > MAX_GIFT_DAYS) {
    return NextResponse.json({ error: `Gift between 1 and ${MAX_GIFT_DAYS} days.` }, { status: 400 });
  }
  const note = String(body.note || "").trim().slice(0, 200) || null;
  const startNow = Boolean(body.startNow);
  const batchId = randomUUID();

  let userIds: string[] = [];
  if (body.all) {
    const { data, error } = await admin.from("profiles").select("id").eq("is_author", true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    userIds = (data || []).map((p) => p.id);
  } else if (body.userId) {
    userIds = [body.userId];
  } else {
    return NextResponse.json({ error: "userId or all required" }, { status: 400 });
  }

  let gifted = 0;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const results = await Promise.all(
      userIds.slice(i, i + CHUNK).map(async (id) => {
        const ok = await giftPassDays(admin, { userId: id, days, batchId, startNow, note });
        if (ok && startNow) await reconcileAuthorAccess(admin, id);
        return ok;
      })
    );
    gifted += results.filter(Boolean).length;
  }

  // One person: also email them if they opted in. Bulk gifts stay in-app to respect Gmail's daily limit.
  let emailed = false;
  if (!body.all && gifted === 1) {
    const consent = await emailConsentFor(admin, { userId: userIds[0] });
    const { data: profile } = await admin.from("profiles").select("email").eq("id", userIds[0]).maybeSingle();
    if (consent.optedIn && profile?.email) {
      const mail = renderEmail({
        heading: `You've been gifted ${days} Studio day${days === 1 ? "" : "s"}`,
        paragraphs: [
          note || "A gift from Novelist Writer: free days of Studio's beta desk, ARC desk, and audience lists.",
          startNow ? "Your pass is running now." : "They're in your bank. Start them whenever your next book is ready.",
        ],
        button: { label: "See your Studio days", url: appUrl("/dashboard/share") },
        notification: true,
      });
      emailed = (await sendEmail({ to: profile.email, subject: "A gift of Studio days", text: mail.text, html: mail.html })).ok;
    }
  }

  return NextResponse.json({ ok: true, gifted, total: userIds.length, emailed });
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendPasswordResetEmail } from "@/lib/password-reset";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = String(body.email || "").trim().toLowerCase();
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Enter the email on your account." }, { status: 400 });
  }

  const result = await sendPasswordResetEmail(createServiceClient(), email);
  if (!result.ok && result.error !== "no_account") {
    return NextResponse.json(
      {
        error: `We couldn't send the reset email (${result.error}). Use Contact us and we'll help.`,
      },
      { status: 503 }
    );
  }

  // Same reply whether or not the account exists
  return NextResponse.json({
    ok: true,
    message: "If that email has an account, a reset link is on its way. Check spam too.",
  });
}

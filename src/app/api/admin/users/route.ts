import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { sendPasswordResetEmail } from "@/lib/password-reset";

function tempPassword() {
  // No look-alike characters so it can be read over the phone or typed from a screenshot
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function GET(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const email = String(new URL(req.url).searchParams.get("email") || "")
    .trim()
    .toLowerCase();
  if (email.length < 3) {
    return NextResponse.json({ error: "Type at least 3 characters of an email" }, { status: 400 });
  }

  const { data: profiles, error } = await auth.admin
    .from("profiles")
    .select("id, email, display_name, is_author, is_beta_reader, is_platform_admin, created_at")
    .ilike("email", `%${email.replace(/[%_]/g, "")}%`)
    .order("email")
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (profiles || []).map((p) => p.id);
  const { data: tiers } = ids.length
    ? await auth.admin.from("credit_balances").select("*").in("user_id", ids)
    : { data: [] as { user_id: string; subscription_tier: string; pass_bank_days?: number; pass_active_until?: string | null }[] };
  const tierById = new Map((tiers || []).map((t) => [t.user_id, t.subscription_tier]));
  const passById = new Map(
    (tiers || []).map((t) => [
      t.user_id,
      {
        bankDays: Number(t.pass_bank_days) || 0,
        activeUntil: t.pass_active_until && Date.parse(t.pass_active_until) > Date.now() ? t.pass_active_until : null,
      },
    ])
  );

  const users = await Promise.all(
    (profiles || []).map(async (p) => {
      const { data } = await auth.admin.auth.admin.getUserById(p.id);
      return {
        id: p.id,
        email: p.email,
        displayName: p.display_name,
        isAuthor: p.is_author !== false,
        isBetaReader: Boolean(p.is_beta_reader),
        isPlatformAdmin: Boolean(p.is_platform_admin),
        tier: tierById.get(p.id) || "free",
        passBankDays: passById.get(p.id)?.bankDays || 0,
        passActiveUntil: passById.get(p.id)?.activeUntil || null,
        createdAt: p.created_at,
        lastSignInAt: data?.user?.last_sign_in_at || null,
      };
    })
  );

  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { userId?: string; action?: "send_reset" | "temp_password" };
  const userId = String(body.userId || "");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { data, error } = await auth.admin.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (error || !email) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (body.action === "send_reset") {
    const result = await sendPasswordResetEmail(auth.admin, email);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error === "no_account" ? "No auth account for that email" : result.error },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, message: `Reset link emailed to ${email}.` });
  }

  if (body.action === "temp_password") {
    const password = tempPassword();
    const { error: upErr } = await auth.admin.auth.admin.updateUserById(userId, { password });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, tempPassword: password, email });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

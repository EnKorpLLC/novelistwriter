import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { sendPasswordResetEmail } from "@/lib/password-reset";
import { MARKET_TYPES } from "@/lib/market-types";

const PAGE_SIZES = [10, 25, 50];

function tempPassword() {
  // No look-alike characters so it can be read over the phone or typed from a screenshot
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function GET(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const email = String(url.searchParams.get("email") || "")
    .trim()
    .toLowerCase()
    .replace(/[%_,()]/g, "");
  const wanted = url.searchParams.get("role");
  const role = (["reader", "narrator", "editor", "artist"] as const).find((r) => r === wanted) || "author";
  const pageSize = PAGE_SIZES.includes(Number(url.searchParams.get("pageSize")))
    ? Number(url.searchParams.get("pageSize"))
    : 10;
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const offset = (page - 1) * pageSize;

  // Editors and artists are marketplace pros with those specialties; narrators are narrator accounts plus pros who narrate
  const proIds = async (types: string[]) => {
    const { data } = await auth.admin.from("pro_profiles").select("user_id").overlaps("specialties", types).limit(2000);
    return (data || []).map((r) => r.user_id as string);
  };
  const pick =
    role === "editor"
      ? await proIds(MARKET_TYPES.filter((t) => t.group === "editing").map((t) => t.id))
      : role === "artist"
        ? await proIds(MARKET_TYPES.filter((t) => t.group === "art").map((t) => t.id))
        : role === "narrator"
          ? await proIds(["narration"])
          : null;

  // Authors: every account with the author role. Readers: every account with the reader role
  // (people with several roles appear in each list). select("*") so it works before the narrator and marketplace columns exist.
  let q = auth.admin.from("profiles").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (role === "reader") q = q.eq("is_beta_reader", true);
  else if (role === "author") q = q.neq("is_author", false);
  else if (role === "narrator") q = pick?.length ? q.or(`is_narrator.eq.true,id.in.(${pick.join(",")})`) : q.eq("is_narrator", true);
  else q = q.in("id", pick?.length ? pick : ["00000000-0000-0000-0000-000000000000"]);
  if (email) q = q.or(`email.ilike.%${email}%,display_name.ilike.%${email}%`);
  const { data: profiles, count, error } = await q.range(offset, offset + pageSize - 1);
  if (error) {
    if (role !== "author" && role !== "reader") return NextResponse.json({ users: [], total: 0, page, pageSize, role, note: "Run the narrator and marketplace database updates to see this list." });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (profiles || []).map((p) => p.id);
  const { data: pros } = ids.length ? await auth.admin.from("pro_profiles").select("user_id, status, specialties, founding").in("user_id", ids) : { data: [] };
  const proById = new Map((pros || []).map((p) => [p.user_id as string, p]));
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
        isNarrator: Boolean(p.is_narrator),
        pro: proById.has(p.id)
          ? {
              status: proById.get(p.id)!.status as string,
              founding: Boolean(proById.get(p.id)!.founding),
              specialties: ((proById.get(p.id)!.specialties || []) as string[]).map((s) => MARKET_TYPES.find((t) => t.id === s)?.label || s),
            }
          : null,
        tier: tierById.get(p.id) || "free",
        passBankDays: passById.get(p.id)?.bankDays || 0,
        passActiveUntil: passById.get(p.id)?.activeUntil || null,
        createdAt: p.created_at,
        lastSignInAt: data?.user?.last_sign_in_at || null,
      };
    })
  );

  return NextResponse.json({ users, total: count || 0, page, pageSize, role });
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

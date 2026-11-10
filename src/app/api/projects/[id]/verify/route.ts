import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { VERIFY_MIGRATION_HINT, ensureVerifyCode, formatVerifyCode, loadVerification, verifyUrl } from "@/lib/verify";
import { appUrl } from "@/lib/stripe";
import { pingIndexNow } from "@/lib/seo";

async function owner(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  return data ? user : null;
}

async function state(projectId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin.from("projects").select("verify_code, verify_public").eq("id", projectId).maybeSingle();
  if (error) return { migrationNeeded: true, error: VERIFY_MIGRATION_HINT };
  const code = data?.verify_code as string | null;
  const on = Boolean(data?.verify_public);
  const v = on && code ? await loadVerification(admin, code).catch(() => null) : null;
  return {
    on,
    code: code ? formatVerifyCode(code) : null,
    url: code ? verifyUrl(code) : null,
    badgeUrl: code ? appUrl(`/verify/${code}/badge.svg`) : null,
    lookupUrl: appUrl("/verify"),
    label: v?.label || null,
  };
}

/** The book's verification badge: on or off, its code, and what it says now. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await owner(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await state(id));
}

/** { on: boolean } turns the public verification page, badge, and API answer on or off. Every plan. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await owner(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { on?: boolean };
  if (typeof body.on !== "boolean") return NextResponse.json({ error: "on required" }, { status: 400 });
  const admin = createServiceClient();
  try {
    const code = body.on ? await ensureVerifyCode(admin, id) : null;
    const { error } = await admin.from("projects").update({ verify_public: body.on }).eq("id", id);
    if (error) throw new Error(VERIFY_MIGRATION_HINT);
    if (code) await pingIndexNow([`/verify/${code}`]).catch(() => null);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 500 });
  }
  return NextResponse.json(await state(id));
}

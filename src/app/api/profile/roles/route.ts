import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { linkInvitesForEmail, normalizeRoles } from "@/lib/beta-platform";

/** If this login email has any beta invites, enable beta-reader role and link them. */
async function syncBetaReaderFromInvites(userId: string, email: string | null | undefined) {
  const admin = createServiceClient();
  const linked = await linkInvitesForEmail(admin, userId, email);
  const normalized = String(email || "")
    .trim()
    .toLowerCase();

  let inviteCount = 0;
  if (normalized.includes("@")) {
    const { count: byEmail } = await admin
      .from("beta_invites")
      .select("id", { count: "exact", head: true })
      .ilike("email", normalized);
    inviteCount = byEmail || 0;
  }
  if (!inviteCount) {
    const { count: byUser } = await admin
      .from("beta_invites")
      .select("id", { count: "exact", head: true })
      .eq("reader_user_id", userId);
    inviteCount = byUser || 0;
  }

  const hasBetaInvites = inviteCount > 0 || linked > 0;
  if (!hasBetaInvites) {
    return { hasBetaInvites: false, enabled: false };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_beta_reader, beta_onboarded_at")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_beta_reader) {
    return { hasBetaInvites: true, enabled: false };
  }

  await supabase
    .from("profiles")
    .update({
      is_beta_reader: true,
      beta_onboarded_at: profile?.beta_onboarded_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  return { hasBetaInvites: true, enabled: true };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let hasBetaInvites = false;
  try {
    const sync = await syncBetaReaderFromInvites(user.id, user.email);
    hasBetaInvites = sync.hasBetaInvites;
  } catch {
    /* migration may be missing */
  }

  const { data } = await supabase
    .from("profiles")
    .select("is_author, is_beta_reader, beta_onboarded_at, display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    roles: normalizeRoles(data),
    hasBetaInvites,
    betaOnboardedAt: data?.beta_onboarded_at || null,
    displayName: data?.display_name || null,
    email: data?.email || user.email || null,
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    enableAuthor?: boolean;
    enableBetaReader?: boolean;
    is_author?: boolean;
    syncFromInvites?: boolean;
  };

  if (body.syncFromInvites) {
    try {
      const sync = await syncBetaReaderFromInvites(user.id, user.email);
      const { data } = await supabase
        .from("profiles")
        .select("is_author, is_beta_reader")
        .eq("id", user.id)
        .maybeSingle();
      return NextResponse.json({
        ok: true,
        roles: normalizeRoles(data),
        hasBetaInvites: sync.hasBetaInvites,
      });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Database needs an update. Run supabase/migration_beta_platform.sql.",
        },
        { status: 500 }
      );
    }
  }

  const { data: current } = await supabase
    .from("profiles")
    .select("is_author, is_beta_reader")
    .eq("id", user.id)
    .maybeSingle();

  const roles = normalizeRoles(current);
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.enableAuthor) {
    patch.is_author = true;
    roles.is_author = true;
  }
  if (body.enableBetaReader) {
    patch.is_beta_reader = true;
    patch.beta_onboarded_at = new Date().toISOString();
    roles.is_beta_reader = true;
  }
  if (typeof body.is_author === "boolean") {
    patch.is_author = body.is_author;
    roles.is_author = body.is_author;
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) {
    if (error.message.includes("is_beta_reader") || error.message.includes("is_author")) {
      return NextResponse.json(
        {
          error:
            "Database needs an update. Run supabase/migration_beta_platform.sql in the Supabase SQL editor.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.enableBetaReader) {
    try {
      const admin = createServiceClient();
      await linkInvitesForEmail(admin, user.id, user.email);
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ ok: true, roles });
}

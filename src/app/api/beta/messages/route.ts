import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { linkInvitesForEmail } from "@/lib/beta-platform";
import { createNotification } from "@/lib/beta-social";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  const admin = createServiceClient();
  await linkInvitesForEmail(admin, user.id, user.email);

  if (conversationId) {
    const { data: convo } = await admin
      .from("beta_conversations")
      .select("*")
      .eq("id", conversationId)
      .maybeSingle();
    if (!convo || (convo.author_user_id !== user.id && convo.reader_user_id !== user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { data: messages } = await admin
      .from("beta_messages")
      .select("id, sender_user_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    return NextResponse.json({ conversation: convo, messages: messages || [] });
  }

  const [{ data: asAuthor }, { data: asReader }] = await Promise.all([
    admin
      .from("beta_conversations")
      .select("*")
      .eq("author_user_id", user.id)
      .order("last_message_at", { ascending: false }),
    admin
      .from("beta_conversations")
      .select("*")
      .eq("reader_user_id", user.id)
      .order("last_message_at", { ascending: false }),
  ]);

  const list = [...(asAuthor || []), ...(asReader || [])];
  const seen = new Set<string>();
  const conversations = list.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const otherIds = [
    ...new Set(
      conversations.flatMap((c) =>
        [c.author_user_id, c.reader_user_id].filter((id) => id && id !== user.id)
      )
    ),
  ] as string[];
  const { data: profiles } = otherIds.length
    ? await admin.from("profiles").select("id, display_name, email").in("id", otherIds)
    : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
  const nameById = new Map((profiles || []).map((p) => [p.id, p.display_name || p.email || "User"]));

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      readerEmail: c.reader_email,
      projectId: c.project_id,
      lastMessageAt: c.last_message_at,
      otherName:
        c.author_user_id === user.id
          ? nameById.get(c.reader_user_id || "") || c.reader_email
          : nameById.get(c.author_user_id) || "Author",
      role: c.author_user_id === user.id ? "author" : "reader",
    })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    conversationId?: string;
    readerEmail?: string;
    readerUserId?: string | null;
    projectId?: string | null;
    text?: string;
  };

  const text = String(body.text || "").trim().slice(0, 8000);
  if (!text) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const admin = createServiceClient();
  await linkInvitesForEmail(admin, user.id, user.email);

  let conversationId = body.conversationId || null;
  let convo: {
    id: string;
    author_user_id: string;
    reader_user_id: string | null;
    reader_email: string;
    project_id: string | null;
  } | null = null;

  if (conversationId) {
    const { data } = await admin
      .from("beta_conversations")
      .select("id, author_user_id, reader_user_id, reader_email, project_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!data || (data.author_user_id !== user.id && data.reader_user_id !== user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    convo = data;
  } else {
    const readerEmail = String(body.readerEmail || "")
      .trim()
      .toLowerCase();
    if (!readerEmail.includes("@")) {
      return NextResponse.json({ error: "readerEmail required" }, { status: 400 });
    }

    const { data: invite } = await admin
      .from("beta_invites")
      .select("id, reader_user_id, project_id")
      .eq("user_id", user.id)
      .ilike("email", readerEmail)
      .limit(1)
      .maybeSingle();
    if (!invite) {
      return NextResponse.json(
        { error: "You can only message readers you’ve invited or approved." },
        { status: 403 }
      );
    }

    let readerUserId = body.readerUserId || invite.reader_user_id;
    if (!readerUserId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", readerEmail)
        .maybeSingle();
      readerUserId = profile?.id || null;
    }

    const { data: existing } = await admin
      .from("beta_conversations")
      .select("id, author_user_id, reader_user_id, reader_email, project_id")
      .eq("author_user_id", user.id)
      .ilike("reader_email", readerEmail)
      .maybeSingle();

    if (existing) {
      convo = existing;
      conversationId = existing.id;
      if (readerUserId && !existing.reader_user_id) {
        await admin
          .from("beta_conversations")
          .update({ reader_user_id: readerUserId })
          .eq("id", existing.id);
        convo = { ...existing, reader_user_id: readerUserId };
      }
    } else {
      const { data: created, error } = await admin
        .from("beta_conversations")
        .insert({
          author_user_id: user.id,
          reader_user_id: readerUserId,
          reader_email: readerEmail,
          project_id: body.projectId || invite.project_id,
        })
        .select("id, author_user_id, reader_user_id, reader_email, project_id")
        .single();
      if (error) {
        return NextResponse.json({ error: migrationHint(error.message) }, { status: 500 });
      }
      convo = created;
      conversationId = created.id;
    }
  }

  if (!convo || !conversationId) {
    return NextResponse.json({ error: "Could not open conversation" }, { status: 500 });
  }

  if (convo.reader_user_id == null && user.email) {
    const email = user.email.trim().toLowerCase();
    if (email === convo.reader_email.trim().toLowerCase()) {
      await admin
        .from("beta_conversations")
        .update({ reader_user_id: user.id })
        .eq("id", conversationId);
      convo = { ...convo, reader_user_id: user.id };
    }
  }

  const { data: message, error: msgErr } = await admin
    .from("beta_messages")
    .insert({
      conversation_id: conversationId,
      sender_user_id: user.id,
      body: text,
    })
    .select("id, sender_user_id, body, created_at")
    .single();

  if (msgErr) {
    return NextResponse.json({ error: migrationHint(msgErr.message) }, { status: 500 });
  }

  await admin
    .from("beta_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  const recipientId =
    convo.author_user_id === user.id ? convo.reader_user_id : convo.author_user_id;
  if (recipientId) {
    const { data: sender } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const href =
      recipientId === convo.author_user_id
        ? convo.project_id
          ? `/project/${convo.project_id}?tab=beta`
          : "/dashboard"
        : "/beta/dashboard?tab=messages";
    await createNotification(admin, {
      userId: recipientId,
      type: "message",
      title: `Message from ${sender?.display_name || "someone"}`,
      body: text.slice(0, 200),
      href,
      meta: { conversationId },
    });
  }

  return NextResponse.json({ ok: true, conversationId, message });
}

function migrationHint(message: string) {
  if (message.includes("beta_conversations") || message.includes("beta_messages")) {
    return "Database needs an update. Run supabase/migration_beta_social.sql in the Supabase SQL editor.";
  }
  return message;
}

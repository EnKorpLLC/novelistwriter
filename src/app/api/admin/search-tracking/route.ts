import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { CONTENT_MIGRATION_HINT } from "@/lib/content";

const AI_TOOLS = ["ChatGPT", "Perplexity", "Gemini", "Copilot", "Claude"];

function monthStart(raw?: string | null) {
  const d = raw && /^\d{4}-\d{2}/.test(raw) ? new Date(`${raw.slice(0, 7)}-01T00:00:00Z`) : new Date();
  return `${d.toISOString().slice(0, 7)}-01`;
}

/** The monthly AI answer check (questions, this month's results, and six months of history) and the listings checklist. */
export async function GET(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const month = monthStart(new URL(req.url).searchParams.get("month"));
  const sixAgo = new Date(`${month}T00:00:00Z`);
  sixAgo.setUTCMonth(sixAgo.getUTCMonth() - 5);
  const [questions, checks, history, listings] = await Promise.all([
    admin.from("ai_check_questions").select("*").order("created_at"),
    admin.from("ai_answer_checks").select("*").eq("month", month),
    admin.from("ai_answer_checks").select("month, mentioned, linked").gte("month", sixAgo.toISOString().slice(0, 10)).lte("month", month),
    admin.from("listing_checklist").select("*").order("label"),
  ]);
  if (questions.error) return NextResponse.json({ error: /ai_check/.test(questions.error.message) ? CONTENT_MIGRATION_HINT : questions.error.message }, { status: 500 });
  const byMonth = new Map<string, { checked: number; mentioned: number; linked: number }>();
  for (const h of history.data || []) {
    const e = byMonth.get(h.month) || { checked: 0, mentioned: 0, linked: 0 };
    e.checked += 1;
    if (h.mentioned) e.mentioned += 1;
    if (h.linked) e.linked += 1;
    byMonth.set(h.month, e);
  }
  return NextResponse.json({
    month,
    tools: AI_TOOLS,
    questions: questions.data || [],
    checks: checks.data || [],
    history: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, e]) => ({ month: m, ...e })),
    listings: listings.data || [],
  });
}

/** { question } adds a question to the monthly check. */
export async function POST(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as { question?: string };
  const question = String(body.question || "").trim().slice(0, 300);
  if (question.length < 8) return NextResponse.json({ error: "Write the question the way a person would ask it." }, { status: 400 });
  const { error } = await auth.admin.from("ai_check_questions").upsert({ question, active: true }, { onConflict: "question" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 *   { month, questionId, tool, mentioned, linked, notes } records one answer;
 *   { questionId, active } turns a question on or off;
 *   { listing, status, url, notes } updates the listings checklist.
 */
export async function PATCH(req: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (typeof body.listing === "string") {
    const patch: Record<string, unknown> = { updated_at: now };
    if (["todo", "submitted", "live", "skip"].includes(String(body.status))) patch.status = body.status;
    if (typeof body.url === "string") patch.url = body.url.slice(0, 300);
    if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 500);
    await admin.from("listing_checklist").update(patch).eq("key", body.listing);
    return NextResponse.json({ ok: true });
  }
  if (typeof body.active === "boolean" && body.questionId) {
    await admin.from("ai_check_questions").update({ active: body.active }).eq("id", String(body.questionId));
    return NextResponse.json({ ok: true });
  }
  if (!body.questionId || !AI_TOOLS.includes(String(body.tool))) return NextResponse.json({ error: "Pick a question and a tool." }, { status: 400 });
  const { error } = await admin.from("ai_answer_checks").upsert(
    {
      month: monthStart(String(body.month || "")),
      question_id: String(body.questionId),
      tool: String(body.tool),
      mentioned: Boolean(body.mentioned),
      linked: Boolean(body.linked),
      notes: String(body.notes || "").slice(0, 500),
      updated_at: now,
    },
    { onConflict: "month,question_id,tool" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PassNoticeData } from "@/components/PassNotice";

const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_DAYS = 3;
const ENDED_CARD_DAYS = 14;

/** Which pass notice (if any) an author should see right now. */
export async function passNoticeFor(
  admin: SupabaseClient,
  userId: string,
  locked: { id: string; title: string }[]
): Promise<PassNoticeData | null> {
  const [{ data: bal }, { data: projects }, { count: unlocks }] = await Promise.all([
    admin.from("credit_balances").select("*").eq("user_id", userId).maybeSingle(),
    admin
      .from("projects")
      .select("title, updated_at, locked_at, reader_grace_until")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    admin.from("project_unlocks").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if (!bal || !("pass_bank_days" in bal)) return null;
  if (bal.subscription_tier === "studio") return null;

  const bankDays = Math.max(0, Number(bal.pass_bank_days) || 0);
  const until = bal.pass_active_until ? Date.parse(bal.pass_active_until) : 0;
  const now = Date.now();

  if (until > now) {
    const daysLeft = Math.ceil((until - now) / DAY_MS);
    if (daysLeft > WARN_DAYS) return null;
    // Pro keeps every project; Free keeps the most recent ones up to its slots
    const slots = bal.subscription_tier === "pro" ? Infinity : 1 + (unlocks || 0);
    const wouldLock = (projects || []).slice(slots === Infinity ? (projects || []).length : slots).map((p) => p.title);
    return { kind: "expiring", daysLeft, endsAt: bal.pass_active_until, bankDays, wouldLock };
  }

  if (until && now - until < ENDED_CARD_DAYS * DAY_MS && !bal.pass_ended_dismissed_at) {
    const graceUntil =
      (projects || [])
        .map((p) => p.reader_grace_until as string | null)
        .filter((g): g is string => Boolean(g && Date.parse(g) > now))
        .sort()
        .pop() || null;
    return {
      kind: "ended",
      endedAt: bal.pass_active_until,
      bankDays,
      locked: locked.map((l) => l.title),
      graceUntil,
    };
  }

  if (bankDays > 0) return { kind: "banked", bankDays };
  return null;
}

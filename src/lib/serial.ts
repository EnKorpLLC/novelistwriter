import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serialPlatform } from "@/lib/serial-export";
import { normalizeSerialSettings } from "@/lib/serial-settings";
import { authorsWithPublicSites } from "@/lib/credits";

type Notify = (userId: string, title: string, body: string, href: string) => Promise<void>;

/**
 * Daily: on each release day, tell the author which chapter is next on each site they post to,
 * or that they've run out of written chapters there. One notice per book per day.
 */
export async function remindSerialReleases(admin: SupabaseClient, notify: Notify) {
  const { data: projects, error } = await admin.from("projects").select("id, user_id, title, serial_settings").not("serial_settings", "is", null).limit(2000);
  if (error || !projects?.length) return 0;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const due = projects
    .map((p) => ({ ...p, s: normalizeSerialSettings(p.serial_settings) }))
    .filter((p) => p.s.remind && p.s.platforms.length && p.s.weekdays.includes(now.getUTCDay()) && p.s.lastRemindedOn !== today);
  if (!due.length) return 0;
  const pro = await authorsWithPublicSites(due.map((p) => p.user_id));

  let sent = 0;
  for (const p of due.filter((d) => pro.has(d.user_id))) {
    const [{ data: chapters }, { data: posts }] = await Promise.all([
      admin.from("chapters").select("id, title, sort_order, word_count").eq("project_id", p.id).gt("word_count", 0).order("sort_order"),
      admin.from("serial_posts").select("chapter_id, platform").eq("project_id", p.id),
    ]);
    const posted = new Set((posts || []).map((x) => `${x.platform}|${x.chapter_id}`));
    const lines: string[] = [];
    for (const id of p.s.platforms) {
      const label = serialPlatform(id)?.label || id;
      const next = (chapters || []).find((c) => !posted.has(`${id}|${c.id}`));
      lines.push(next ? `${next.title || "Next chapter"} on ${label}` : `No written chapters left for ${label}`);
    }
    const title = `Release day for ${p.title || "your serial"}`;
    await notify(p.user_id, title, `Up next: ${lines.join("; ")}.`, `/project/${p.id}?tab=serial`);
    await admin.from("projects").update({ serial_settings: { ...p.s, lastRemindedOn: today } }).eq("id", p.id);
    sent += 1;
  }
  return sent;
}

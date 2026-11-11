import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorContact } from "@/lib/audience";
import { createNotification } from "@/lib/beta-social";
import { userHasStudio } from "@/lib/credits";
import { renderEmail, sendEmail } from "@/lib/email";
import { bookPath } from "@/lib/handles";
import { TEAM_OPEN_AFTER_RELEASE_DAYS, TEAM_TASKS } from "@/lib/launch-team";
import { appUrl } from "@/lib/stripe";

/**
 * Who read for an author and how it went: reading progress, launch team places and invites, and taking a reader
 * off the lists. Shared by the Beta readers and Advance copies tabs and the Audience page.
 */

export const ROSTER_HINT = "Database needs an update. Run supabase/migration_reader_roster.sql in the Supabase SQL editor.";

export type ReaderKind = "beta" | "arc";
export type TeamState = { member: boolean; joinedAt: string | null; invitedAt: string | null };

const NO_TEAM: TeamState = { member: false, joinedAt: null, invitedAt: null };
const norm = (email: string | null | undefined) => String(email || "").trim().toLowerCase();
const teamKey = (projectId: string, email: string) => `${projectId}|${norm(email)}`;

/** Share of the book read: the average of how far each chapter got. */
export function bookPercent(percents: number[], chapterCount: number) {
  if (!chapterCount) return 0;
  const sum = percents.reduce((n, p) => n + Math.min(100, Math.max(0, Number(p) || 0)), 0);
  return Math.min(100, Math.round(sum / chapterCount));
}

export async function chapterCounts(admin: SupabaseClient, projectIds: string[]) {
  const counts = new Map<string, number>();
  if (!projectIds.length) return counts;
  const { data } = await admin.from("chapters").select("project_id").in("project_id", projectIds);
  for (const r of data || []) counts.set(r.project_id, (counts.get(r.project_id) || 0) + 1);
  return counts;
}

/** Each invite's chapter percents. ARC progress needs migration_reader_insights.sql; without it, none. */
export async function chapterPercents(admin: SupabaseClient, kind: ReaderKind, projectIds: string[]) {
  const out = new Map<string, number[]>();
  if (!projectIds.length) return out;
  const { data, error } = await admin
    .from(kind === "beta" ? "beta_reading_progress" : "arc_reading_progress")
    .select("invite_id, percent")
    .in("project_id", projectIds);
  if (error) return out;
  for (const r of data || []) out.set(r.invite_id, [...(out.get(r.invite_id) || []), r.percent]);
  return out;
}

/** Invites the author deleted from their lists. Empty until migration_reader_roster.sql has run. */
export async function removedInviteIds(admin: SupabaseClient, kind: ReaderKind, projectIds: string[]) {
  if (!projectIds.length) return new Set<string>();
  const { data, error } = await admin
    .from(kind === "beta" ? "beta_invites" : "arc_invites")
    .select("id, removed_at")
    .in("project_id", projectIds)
    .not("removed_at", "is", null);
  return new Set(error ? [] : (data || []).map((r) => r.id as string));
}

/** Launch team places and invites, by book and email. */
export async function teamStates(admin: SupabaseClient, projectIds: string[]) {
  const out = new Map<string, TeamState>();
  if (!projectIds.length) return out;
  const [{ data: members }, { data: invites }] = await Promise.all([
    admin.from("launch_team").select("project_id, user_id, joined_at").in("project_id", projectIds),
    admin.from("launch_team_invites").select("project_id, email, invited_at").in("project_id", projectIds),
  ]);
  const ids = [...new Set((members || []).map((m) => m.user_id as string))];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id, email").in("id", ids) : { data: [] };
  const emailById = new Map((profiles || []).map((p) => [p.id as string, norm(p.email)]));
  for (const i of invites || []) out.set(teamKey(i.project_id, i.email), { ...NO_TEAM, invitedAt: i.invited_at });
  for (const m of members || []) {
    const email = emailById.get(m.user_id);
    if (!email) continue;
    const k = teamKey(m.project_id, email);
    out.set(k, { ...(out.get(k) || NO_TEAM), member: true, joinedAt: m.joined_at });
  }
  return out;
}

export const teamFor = (states: Map<string, TeamState>, projectId: string, email: string) => states.get(teamKey(projectId, email)) || NO_TEAM;

/** Everyone on a launch team for these books, newest first. */
export async function teamMembers(admin: SupabaseClient, projects: { id: string; title: string }[]) {
  const ids = projects.map((p) => p.id);
  if (!ids.length) return [];
  const title = new Map(projects.map((p) => [p.id, p.title || "Untitled"]));
  const { data: rows } = await admin.from("launch_team").select("project_id, user_id, joined_at, tasks").in("project_id", ids).order("joined_at", { ascending: false });
  const userIds = [...new Set((rows || []).map((r) => r.user_id as string))];
  const { data: profiles } = userIds.length ? await admin.from("profiles").select("id, display_name, email").in("id", userIds) : { data: [] };
  const byId = new Map((profiles || []).map((p) => [p.id as string, p]));
  return (rows || []).map((r) => {
    const tasks = (r.tasks as Record<string, string>) || {};
    return {
      projectId: r.project_id as string,
      title: title.get(r.project_id) || "Untitled",
      userId: r.user_id as string,
      name: byId.get(r.user_id)?.display_name || "",
      email: norm(byId.get(r.user_id)?.email),
      joinedAt: r.joined_at as string,
      tasksDone: TEAM_TASKS.filter((t) => tasks[t.id]).map((t) => t.label),
      tasksTotal: TEAM_TASKS.length,
    };
  });
}

/** Asks a reader to join a book's launch team: an email with a link to the launch page, and a notice if they have an account. */
export async function inviteToLaunchTeam(
  admin: SupabaseClient,
  opts: { projectId: string; authorUserId: string; email: string; displayName?: string | null }
): Promise<{ ok: true } | { error: string; status: number }> {
  const email = norm(opts.email);
  if (!email.includes("@")) return { error: "That reader has no email address.", status: 400 };
  const { data: project } = await admin.from("projects").select("*").eq("id", opts.projectId).eq("user_id", opts.authorUserId).maybeSingle();
  if (!project) return { error: "Book not found.", status: 404 };
  if (!(await userHasStudio(opts.authorUserId))) return { error: "Launch teams are part of Studio.", status: 402 };
  if (!project.launch_public && !project.published) {
    return { error: "Make this book's launch page public first (Launch → Launch page), so readers have somewhere to join.", status: 400 };
  }
  const anchor = project.release_date ? Date.parse(`${project.release_date}T00:00:00Z`) : project.published_at ? Date.parse(project.published_at) : null;
  if (anchor != null && Date.now() >= anchor + TEAM_OPEN_AFTER_RELEASE_DAYS * 86_400_000) {
    return { error: `This book's launch team closed ${TEAM_OPEN_AFTER_RELEASE_DAYS} days after release.`, status: 400 };
  }
  const { data: profile } = await admin.from("profiles").select("handle").eq("id", opts.authorUserId).maybeSingle();
  if (!profile?.handle || !project.slug) return { error: "Set up the launch page's address first (Launch → Launch page).", status: 400 };
  if (teamFor(await teamStates(admin, [project.id]), project.id, email).member) return { error: "They're already on this launch team.", status: 400 };

  const url = appUrl(`${bookPath(profile.handle, project.slug)}#launch-team`);
  const author = await authorContact(admin, opts.authorUserId);
  const mail = renderEmail({
    heading: `Join the launch team for "${project.title}"`,
    paragraphs: [
      opts.displayName ? `Hi ${opts.displayName},` : "Hi,",
      `${author.name} would love your help launching "${project.title}". Launch team readers share the book on launch day, post an honest review, and ask their library to stock it. Do as much or as little as you like.`,
      "Open the launch page, sign in (or create a free reader account) with this email address, and choose Join the launch team.",
    ],
    button: { label: "Join the launch team", url },
    footer: "Reply to this email to reach the author directly.",
  });
  const sent = await sendEmail({ to: email, subject: `${author.name} invited you to the launch team for "${project.title}"`, text: mail.text, html: mail.html, replyTo: author.email || undefined });
  const { data: reader } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (reader?.id) {
    await createNotification(admin, {
      userId: reader.id,
      type: "launch_team",
      title: `You're invited to the launch team for "${project.title}"`,
      body: `${author.name} would love your help on launch day.`,
      href: `${bookPath(profile.handle, project.slug)}#launch-team`,
      meta: { projectId: project.id },
    });
  }
  if (!sent.ok && !reader?.id) return { error: sent.error || "The invite email couldn't be sent.", status: 502 };
  await admin.from("launch_team_invites").upsert({ project_id: project.id, email, invited_at: new Date().toISOString() }, { onConflict: "project_id,email" });
  return { ok: true };
}

/** Takes a reader off this book's lists and ends their access. Their comments, reviews, and progress stay. */
export async function removeReader(admin: SupabaseClient, opts: { kind: ReaderKind; projectId: string; email: string }) {
  const email = norm(opts.email);
  const table = opts.kind === "beta" ? "beta_invites" : "arc_invites";
  const { error } = await admin.from(table).update({ status: "revoked", removed_at: new Date().toISOString() }).eq("project_id", opts.projectId).ilike("email", email);
  if (error && /removed_at/.test(error.message)) await admin.from(table).update({ status: "revoked" }).eq("project_id", opts.projectId).ilike("email", email);
  else if (error) throw new Error(error.message);
  if (opts.kind === "beta") await admin.from("beta_contacts").delete().eq("project_id", opts.projectId).ilike("email", email);
}

export async function removeFromTeam(admin: SupabaseClient, opts: { projectId: string; userId: string; email?: string }) {
  await admin.from("launch_team").delete().eq("project_id", opts.projectId).eq("user_id", opts.userId);
  if (opts.email) await admin.from("launch_team_invites").delete().eq("project_id", opts.projectId).eq("email", norm(opts.email));
}

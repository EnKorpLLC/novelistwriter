import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasStudio } from "@/lib/credits";
import { formatMailingAddress, normalizeMailingAddress, normalizeReviewLinks, reviewSiteKey } from "@/lib/arc";

type BookRef = { projectId: string; title: string; status: string; finishedAt: string | null };

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await userHasStudio(user.id))) {
    return NextResponse.json({ studioAccess: false });
  }

  const admin = createServiceClient();
  const { data: projects } = await admin
    .from("projects")
    .select("id, title, arc_deadline, arc_review_links")
    .eq("user_id", user.id);
  const projectById = new Map((projects || []).map((p) => [p.id, p]));
  const projectIds = [...projectById.keys()];

  const [{ data: subs, error: subErr }, { data: betaRows }, { data: arcRows }] = await Promise.all([
    admin
      .from("author_subscribers")
      .select("email, display_name, sources, subscribed_at, unsubscribed_at, confirmed_at")
      .eq("author_user_id", user.id)
      .order("subscribed_at", { ascending: false }),
    projectIds.length
      ? admin
          .from("beta_invites")
          .select("email, display_name, project_id, status, finished_at")
          .in("project_id", projectIds)
          .in("status", ["pending", "accepted", "dnf", "revoked"])
      : Promise.resolve({ data: [] as never[] }),
    projectIds.length
      ? admin
          .from("arc_invites")
          .select("email, display_name, project_id, status, finished_at, review_posts, mailing_address")
          .in("project_id", projectIds)
          .in("status", ["active", "revoked"])
      : Promise.resolve({ data: [] as never[] }),
  ]);
  if (subErr) {
    const hint = subErr.message.includes("author_subscribers")
      ? "Database needs an update. Run supabase/migration_platform_admin.sql in the Supabase SQL editor."
      : subErr.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }

  function group<T extends { email: string; display_name: string | null }>(
    rows: T[],
    toBook: (r: T) => BookRef & Record<string, unknown>
  ) {
    const byEmail = new Map<string, { email: string; displayName: string | null; books: ReturnType<typeof toBook>[] }>();
    for (const r of rows) {
      const email = r.email.trim().toLowerCase();
      const entry = byEmail.get(email) || { email, displayName: null, books: [] };
      if (!entry.displayName && r.display_name) entry.displayName = r.display_name;
      entry.books.push(toBook(r));
      byEmail.set(email, entry);
    }
    return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
  }

  const betaReaders = group(betaRows || [], (r) => ({
    projectId: r.project_id,
    title: projectById.get(r.project_id)?.title || "Untitled",
    status: r.finished_at ? "finished" : r.status === "dnf" ? "DNF" : r.status === "revoked" ? "removed" : "reading",
    finishedAt: r.finished_at,
  }));

  const arcReaders = group(arcRows || [], (r) => {
    const p = projectById.get(r.project_id);
    const deadline = p?.arc_deadline ? Date.parse(p.arc_deadline) : null;
    const posts = (r.review_posts as Record<string, string>) || {};
    const address = normalizeMailingAddress(r.mailing_address);
    return {
      projectId: r.project_id,
      title: p?.title || "Untitled",
      status: r.status === "revoked" ? "removed" : r.finished_at ? "finished" : "reading",
      finishedAt: r.finished_at,
      onTime: Boolean(r.finished_at) && (deadline == null || Date.parse(r.finished_at!) <= deadline),
      reviewSites: normalizeReviewLinks(p?.arc_review_links)
        .filter((l) => posts[reviewSiteKey(l)])
        .map((l) => l.label),
      mailingAddress: address ? formatMailingAddress(address) : null,
      addressNote: address?.note || null,
    };
  });

  return NextResponse.json({
    studioAccess: true,
    subscribers: (subs || []).map((s) => ({
      email: s.email,
      displayName: s.display_name,
      sources: s.sources || [],
      subscribedAt: s.subscribed_at,
      unsubscribed: Boolean(s.unsubscribed_at),
      confirmed: Boolean(s.confirmed_at),
    })),
    betaReaders,
    arcReaders,
  });
}

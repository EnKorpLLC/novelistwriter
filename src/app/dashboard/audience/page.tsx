"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ReaderActions, ReaderStatsLine } from "@/components/ReaderRoster";
import type { TeamState } from "@/lib/reader-roster";

type Subscriber = {
  email: string;
  displayName: string | null;
  sources: string[];
  subscribedAt: string;
  unsubscribed: boolean;
  confirmed: boolean;
};

type ReaderBook = {
  projectId: string;
  title: string;
  status: string;
  finishedAt: string | null;
  onTime?: boolean;
  reviewSites?: string[];
  mailingAddress?: string | null;
  addressNote?: string | null;
  percent: number;
  comments?: number;
  review: boolean;
  team: TeamState;
};

type Reader = { email: string; displayName: string | null; books: ReaderBook[] };

type TeamMember = {
  projectId: string;
  title: string;
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
  tasksDone: string[];
  tasksTotal: number;
};

type AudienceData = {
  studioAccess: boolean;
  subscribers?: Subscriber[];
  betaReaders?: Reader[];
  arcReaders?: Reader[];
  launchTeam?: TeamMember[];
};

const SOURCE_LABEL: Record<string, string> = { opt_in: "Opted in", beta: "Beta reader", arc: "ARC reader" };
const TABS = [
  { id: "subscribers", label: "Email subscribers" },
  { id: "beta", label: "Beta readers" },
  { id: "arc", label: "ARC readers" },
  { id: "team", label: "Launch team" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function day(iso: string | null | undefined) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

function teamLabel(t: TeamState | undefined) {
  return t?.member ? "member" : t?.invitedAt ? `invited ${day(t.invitedAt)}` : "";
}

export default function AudiencePage() {
  const [data, setData] = useState<AudienceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("subscribers");
  const [showUnsubscribed, setShowUnsubscribed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    void fetch("/api/audience")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Could not load");
        setData(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const subscribers = (data?.subscribers || []).filter((s) => showUnsubscribed || !s.unsubscribed);
  const beta = data?.betaReaders || [];
  const arc = data?.arcReaders || [];
  const team = data?.launchTeam || [];

  async function removeFromTeam(m: TeamMember) {
    if (!window.confirm(`Take ${m.name || m.email} off the launch team for ${m.title}?`)) return;
    setBusy(`${m.projectId}:${m.userId}`);
    try {
      const res = await fetch("/api/audience/readers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_team", projectId: m.projectId, userId: m.userId, email: m.email }),
      });
      const json = await res.json().catch(() => ({}));
      setNote(res.ok ? `${m.name || m.email} is off the launch team for ${m.title}.` : json.error || "Couldn't remove them");
      if (res.ok) load();
    } finally {
      setBusy(null);
    }
  }

  function exportCurrent() {
    if (tab === "subscribers") {
      downloadCsv("email-subscribers.csv", [
        ["Email", "Name", "Source", "Subscribed", "Status"],
        ...subscribers.map((s) => [
          s.email,
          s.displayName || "",
          s.sources.map((x) => SOURCE_LABEL[x] || x).join("; "),
          day(s.subscribedAt),
          s.unsubscribed ? "unsubscribed" : s.confirmed ? "subscribed" : "awaiting confirmation",
        ]),
      ]);
    } else if (tab === "beta") {
      downloadCsv("beta-readers.csv", [
        ["Email", "Name", "Book", "Status", "Finished", "Read %", "Comments", "Review", "Launch team"],
        ...beta.flatMap((r) =>
          r.books.map((b) => [
            r.email,
            r.displayName || "",
            b.title,
            b.status,
            day(b.finishedAt),
            String(b.percent),
            String(b.comments ?? 0),
            b.review ? "yes" : "no",
            teamLabel(b.team),
          ])
        ),
      ]);
    } else if (tab === "arc") {
      downloadCsv("arc-readers.csv", [
        ["Email", "Name", "Book", "Status", "Finished", "On time", "Read %", "Review", "Reviews posted", "Launch team", "Mailing address", "Note"],
        ...arc.flatMap((r) =>
          r.books.map((b) => [
            r.email,
            r.displayName || "",
            b.title,
            b.status,
            day(b.finishedAt),
            b.finishedAt ? (b.onTime ? "yes" : "no") : "",
            String(b.percent),
            b.review ? "yes" : "no",
            (b.reviewSites || []).join("; "),
            teamLabel(b.team),
            b.mailingAddress || "",
            b.addressNote || "",
          ])
        ),
      ]);
    } else {
      downloadCsv("launch-team.csv", [
        ["Email", "Name", "Book", "Joined", "Tasks done"],
        ...team.map((m) => [m.email, m.name, m.title, day(m.joinedAt), m.tasksDone.join("; ")]),
      ]);
    }
  }

  function readerList(readers: Reader[], kind: "beta" | "arc") {
    if (!readers.length) return <p className="mt-4 text-sm text-muted">No {kind === "arc" ? "ARC" : "beta"} readers yet.</p>;
    return (
      <ul className="mt-4 space-y-2">
        {readers.map((r) => (
          <li key={r.email} className="border border-line px-4 py-3 text-sm">
            <p className="text-ink">
              {r.displayName ? `${r.displayName} — ` : ""}
              {r.email}
            </p>
            <ul className="mt-2 space-y-3 text-xs text-muted">
              {r.books.map((b) => (
                <li key={b.projectId} className="border-t border-line/60 pt-2">
                  <Link href={`/project/${b.projectId}?tab=${kind}`} className="text-ink hover:text-accent">
                    {b.title}
                  </Link>
                  {b.status === "removed" ? " · access removed" : ""}
                  {b.finishedAt ? ` · finished ${day(b.finishedAt)}` : ""}
                  {kind === "arc" && b.finishedAt ? (b.onTime ? " · on time" : " · late") : ""}
                  {b.reviewSites?.length ? ` · reviewed on ${b.reviewSites.join(", ")}` : ""}
                  <span className="mt-1 block">
                    <ReaderStatsLine
                      stats={{
                        finished: Boolean(b.finishedAt),
                        dnf: b.status === "DNF",
                        percent: b.percent,
                        comments: kind === "beta" ? b.comments ?? 0 : null,
                        review: b.review,
                        team: b.team,
                      }}
                    />
                  </span>
                  {b.mailingAddress ? <span className="mt-1 block text-ink/80">Ship to: {b.mailingAddress}</span> : null}
                  <span className="mt-1.5 block">
                    <ReaderActions
                      projectId={b.projectId}
                      kind={kind}
                      email={r.email}
                      displayName={r.displayName}
                      team={b.team}
                      onDone={load}
                      onNote={setNote}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/dashboard" className="font-ui text-sm text-accent">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-6 text-3xl">Audience</h1>
      <p className="font-ui mt-2 text-sm text-muted">
        Everyone who has joined your email list, beta read for you, or received an ARC, across all
        your books.
      </p>

      {error && <p className="font-ui mt-6 text-sm text-danger">{error}</p>}
      {!data && !error && <p className="font-ui mt-6 text-sm text-muted">Loading…</p>}

      {data && !data.studioAccess && (
        <div className="font-ui mt-8 border border-line bg-paper p-5">
          <p className="text-sm text-ink">
            Your audience lists are included with <strong>Studio</strong>. Upgrade to collect email
            subscribers and keep a master list of your beta and ARC readers.
          </p>
          <a href="/billing" className="mt-4 inline-block bg-accent px-4 py-2 text-sm text-paper">
            Upgrade to Studio
          </a>
        </div>
      )}

      {data?.studioAccess && (
        <div className="font-ui">
          <nav className="mt-8 flex flex-wrap items-end justify-between gap-3 border-b border-line">
            <div className="flex flex-wrap gap-1">
              {TABS.map((t) => {
                const count =
                  t.id === "subscribers" ? subscribers.length : t.id === "beta" ? beta.length : t.id === "arc" ? arc.length : team.length;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`px-3 py-2.5 text-sm ${
                      tab === t.id
                        ? "border-b-2 border-accent text-ink"
                        : "border-b-2 border-transparent text-muted hover:text-ink"
                    }`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label} <span className="text-xs text-accent">{count}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="mb-2 text-xs text-accent hover:underline" onClick={exportCurrent}>
              Export CSV
            </button>
          </nav>

          {tab === "subscribers" && (
            <section>
              <p className="mt-4 text-xs text-muted">
                Beta and ARC readers are added automatically. Readers can also opt in from your book
                pages. Use the CSV with your newsletter tool; anyone who unsubscribes there should
                be removed there too.
              </p>
              <label className="mt-3 flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={showUnsubscribed}
                  onChange={(e) => setShowUnsubscribed(e.target.checked)}
                />
                Show people who left the list
              </label>
              {subscribers.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No subscribers yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-line border border-line">
                  {subscribers.map((s) => (
                    <li key={s.email} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm">
                      <span className={s.unsubscribed ? "text-muted line-through" : "text-ink"}>
                        {s.displayName ? `${s.displayName} — ` : ""}
                        {s.email}
                      </span>
                      <span className="text-xs text-muted">
                        {s.sources.map((x) => SOURCE_LABEL[x] || x).join(", ")} · {day(s.subscribedAt)}
                        {!s.confirmed && !s.unsubscribed ? " · awaiting confirmation" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {note && (
            <p role="status" className="mt-4 border border-line bg-paper-deep/40 px-3 py-2 text-xs text-ink">
              {note}
            </p>
          )}
          {tab === "beta" && readerList(beta, "beta")}
          {tab === "arc" && readerList(arc, "arc")}
          {tab === "team" && (
            <section>
              <p className="mt-4 text-xs text-muted">
                Readers who joined a launch team, for every book. Invite beta and ARC readers from their tabs; they join from the book&apos;s
                launch page.
              </p>
              {team.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No one has joined a launch team yet.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {team.map((m) => (
                    <li key={`${m.projectId}:${m.userId}`} className="flex flex-wrap items-start justify-between gap-2 border border-line px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block text-ink">
                          {m.name ? `${m.name} — ` : ""}
                          {m.email}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          <Link href={`/project/${m.projectId}?tab=publish`} className="text-ink hover:text-accent">
                            {m.title}
                          </Link>{" "}
                          · joined {day(m.joinedAt)} · {m.tasksDone.length} of {m.tasksTotal} tasks done
                          {m.tasksDone.length ? ` (${m.tasksDone.join("; ")})` : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy === `${m.projectId}:${m.userId}`}
                        className="border border-line px-2 py-1 text-[10px] text-danger disabled:opacity-50"
                        onClick={() => void removeFromTeam(m)}
                      >
                        Remove from team
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

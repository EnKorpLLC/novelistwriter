"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
};

type Reader = { email: string; displayName: string | null; books: ReaderBook[] };

type AudienceData = {
  studioAccess: boolean;
  subscribers?: Subscriber[];
  betaReaders?: Reader[];
  arcReaders?: Reader[];
};

const SOURCE_LABEL: Record<string, string> = { opt_in: "Opted in", beta: "Beta reader", arc: "ARC reader" };
const TABS = [
  { id: "subscribers", label: "Email subscribers" },
  { id: "beta", label: "Beta readers" },
  { id: "arc", label: "ARC readers" },
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

export default function AudiencePage() {
  const [data, setData] = useState<AudienceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("subscribers");
  const [showUnsubscribed, setShowUnsubscribed] = useState(false);

  useEffect(() => {
    void fetch("/api/audience")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Could not load");
        setData(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  const subscribers = (data?.subscribers || []).filter((s) => showUnsubscribed || !s.unsubscribed);
  const beta = data?.betaReaders || [];
  const arc = data?.arcReaders || [];

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
        ["Email", "Name", "Book", "Status", "Finished"],
        ...beta.flatMap((r) =>
          r.books.map((b) => [r.email, r.displayName || "", b.title, b.status, day(b.finishedAt)])
        ),
      ]);
    } else {
      downloadCsv("arc-readers.csv", [
        ["Email", "Name", "Book", "Status", "Finished", "On time", "Reviews posted", "Mailing address", "Note"],
        ...arc.flatMap((r) =>
          r.books.map((b) => [
            r.email,
            r.displayName || "",
            b.title,
            b.status,
            day(b.finishedAt),
            b.finishedAt ? (b.onTime ? "yes" : "no") : "",
            (b.reviewSites || []).join("; "),
            b.mailingAddress || "",
            b.addressNote || "",
          ])
        ),
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
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {r.books.map((b) => (
                <li key={b.projectId}>
                  <Link href={`/project/${b.projectId}?tab=${kind}`} className="text-ink hover:text-accent">
                    {b.title}
                  </Link>{" "}
                  · {b.status}
                  {b.finishedAt ? ` ${day(b.finishedAt)}` : ""}
                  {kind === "arc" && b.finishedAt ? (b.onTime ? " · on time" : " · late") : ""}
                  {b.reviewSites?.length ? ` · reviewed on ${b.reviewSites.join(", ")}` : ""}
                  {b.mailingAddress ? (
                    <span className="block text-ink/80">Ship to: {b.mailingAddress}</span>
                  ) : null}
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
                const count = t.id === "subscribers" ? subscribers.length : t.id === "beta" ? beta.length : arc.length;
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

          {tab === "beta" && readerList(beta, "beta")}
          {tab === "arc" && readerList(arc, "arc")}
        </div>
      )}
    </div>
  );
}

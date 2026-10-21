"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PUBLIC_LINK_FIELDS,
  type LabeledLink,
  type PublicLinkId,
  type PublicLinks,
} from "@/lib/public-profile";
import { TrustBadges } from "@/components/TrustBadges";

export default function PublicProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [fields, setFields] = useState<Partial<Record<PublicLinkId, string>>>({});
  const [extra, setExtra] = useState<LabeledLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function apply(links: PublicLinks) {
    const { extra: ex, ...rest } = links;
    setFields(rest);
    setExtra(ex || []);
  }

  useEffect(() => {
    void fetch("/api/profile/public")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Could not load");
        setUserId(data.userId);
        setDisplayName(data.displayName || "");
        apply(data.links || {});
      })
      .catch((err) => setNote(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/profile/public", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, links: { ...fields, extra } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      apply(data.links || {});
      setNote("Saved. These links show on your book pages and author page.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <Link href="/dashboard" className="font-ui text-sm text-accent">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-6 text-3xl">Public profile</h1>
      <p className="font-ui mt-2 text-sm text-muted">
        Your website and social links in one place. They appear on your beta and ARC book pages,
        your published books, and your author page.
      </p>
      {userId && (
        <a
          href={`/authors/${userId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-ui mt-4 inline-block border border-accent px-4 py-2 text-sm text-accent hover:bg-accent hover:text-paper"
        >
          See what visitors see →
        </a>
      )}

      <form onSubmit={(e) => void save(e)} className="font-ui mt-8 space-y-4">
        <label className="block text-sm">
          Author name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full border border-line bg-paper px-3 py-2"
          />
        </label>
        {PUBLIC_LINK_FIELDS.map((f) => (
          <label key={f.id} className="block text-sm">
            {f.label}
            <input
              value={fields[f.id] || ""}
              onChange={(e) => setFields((cur) => ({ ...cur, [f.id]: e.target.value }))}
              placeholder="https://…"
              className="mt-1 w-full border border-line bg-paper px-3 py-2"
            />
          </label>
        ))}

        <div>
          <p className="text-sm">Other links</p>
          <ul className="mt-2 space-y-2">
            {extra.map((l, i) => (
              <li key={i} className="flex gap-2">
                <input
                  value={l.label}
                  onChange={(e) =>
                    setExtra((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  placeholder="Label (e.g. Newsletter)"
                  className="w-36 border border-line bg-paper px-2 py-1.5 text-sm"
                />
                <input
                  value={l.url}
                  onChange={(e) =>
                    setExtra((ls) => ls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                  }
                  placeholder="https://…"
                  className="min-w-0 flex-1 border border-line bg-paper px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  className="text-xs text-danger hover:underline"
                  onClick={() => setExtra((ls) => ls.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 border border-line px-2 py-1 text-xs text-accent"
            onClick={() => setExtra((ls) => [...ls, { label: "", url: "" }])}
          >
            + Add link
          </button>
        </div>

        <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-paper disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
        {note && <p className="text-sm text-muted">{note}</p>}
      </form>

      <BadgeOverview />
    </div>
  );
}

type BadgeBook = {
  projectId: string;
  title: string;
  noAiOnBook: boolean;
  aiUsedAt: string | null;
  shownOn: { label: string; href: string }[];
};

function BadgeOverview() {
  const [data, setData] = useState<{ aiOffSince: string | null; books: BadgeBook[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/profile/badges")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Could not load badges");
        setData(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load badges"));
  }, []);

  return (
    <section className="font-ui mt-12">
      <h2 className="font-display text-2xl">Your badges</h2>
      <p className="mt-1 text-sm text-muted">
        What visitors see next to your name and on each book.
      </p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {!data && !error && <p className="mt-3 text-sm text-muted">Loading…</p>}
      {data && (
        <>
          <div className="mt-4 border border-line px-4 py-3 text-sm">
            <p className="text-[10px] uppercase tracking-wide text-muted">On your author page</p>
            {data.aiOffSince ? (
              <div className="mt-2">
                <TrustBadges aiOffSince={data.aiOffSince} />
              </div>
            ) : (
              <p className="mt-1 text-muted">
                No account badge. Turn off all AI tools in{" "}
                <Link href="/settings" className="text-accent underline">
                  Settings
                </Link>{" "}
                to show &ldquo;AI tools off.&rdquo;
              </p>
            )}
          </div>
          {data.books.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No books yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.books.map((b) => (
                <li key={b.projectId} className="border border-line px-4 py-3 text-sm">
                  <p className="text-ink">{b.title}</p>
                  <div className="mt-2">
                    {b.noAiOnBook ? (
                      <TrustBadges noAiOnBook />
                    ) : (
                      <p className="text-xs text-muted">
                        No &ldquo;No AI used&rdquo; badge: AI was run on this book
                        {b.aiUsedAt ? ` (first on ${new Date(b.aiUsedAt).toLocaleDateString()})` : ""}.
                      </p>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {b.shownOn.length ? (
                      <>
                        Visible on:{" "}
                        {b.shownOn.map((s, i) => (
                          <span key={s.href}>
                            {i > 0 ? ", " : ""}
                            <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                              {s.label}
                            </a>
                          </span>
                        ))}
                      </>
                    ) : (
                      "Not public yet. Badges appear once the book is published or open for beta or ARC readers."
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

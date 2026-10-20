"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PUBLIC_LINK_FIELDS,
  type LabeledLink,
  type PublicLinkId,
  type PublicLinks,
} from "@/lib/public-profile";

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
        {userId && (
          <>
            {" "}
            <Link href={`/authors/${userId}`} className="text-accent underline">
              View author page
            </Link>
          </>
        )}
      </p>

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
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type Post = {
  id: string;
  kind: string;
  caption: string;
  link_path: string;
  image_title: string;
  image_kicker: string;
  status: "queued" | "posted" | "skipped";
  results: Record<string, { at: string; url?: string | null; error?: string | null; manual?: boolean }>;
  suggested_on: string;
  links: Record<string, string>;
  visitors: number;
  signups: number;
};
type Data = { connected: string[]; autoNetworks: string[]; manualNetworks: string[]; queued: Post[]; recent: Post[] };

const LABEL: Record<string, string> = {
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  instagram: "Instagram",
  tiktok: "TikTok",
  threads: "Threads",
  x: "X",
  facebook: "Facebook",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
};
const KIND: Record<string, string> = { release: "New release", launch: "Launching soon", arc: "Advance copies", beta: "Beta readers", challenge: "Challenge", milestone: "Milestone", tip: "Tool tip" };

/** G5: posts for Novelist Writer's own accounts. Nothing goes out until you approve it here. */
export function AdminSocial({ onNote }: { onNote: (msg: string | null) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/social");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      onNote(json.error || "Could not load the social queue");
      return;
    }
    setData(json);
    setCaptions((c) => Object.fromEntries((json.queued as Post[]).map((p) => [p.id, c[p.id] ?? p.caption])));
  }, [onNote]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, body: Record<string, unknown>, done?: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/social", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
      const json = await res.json().catch(() => ({}));
      onNote(res.ok && json.ok !== false ? done || null : json.error || "Could not update");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    setBusy("fill");
    const res = await fetch("/api/admin/social", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    onNote(res.ok ? (json.added ? `Added ${json.added} suggestion${json.added === 1 ? "" : "s"}.` : "Nothing new to suggest right now.") : json.error || "Could not suggest posts");
    setBusy(null);
    await load();
  }

  if (!data) return <p className="mt-6 text-sm text-muted">Loading…</p>;

  return (
    <div className="mt-6 space-y-8 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-muted">
          Up to two suggestions a day: releases, launches, advance copies, and beta reads from authors who opted in, plus challenges,
          milestones, and tool tips. Captions are written templates; edit freely. Connected:{" "}
          {data.connected.length ? data.connected.map((n) => LABEL[n]).join(", ") : "none yet (posts are download-and-post by hand)"}.
        </p>
        <button type="button" disabled={busy === "fill"} onClick={() => void suggest()} className="border border-line px-4 py-2 disabled:opacity-50">
          Suggest posts now
        </button>
      </div>

      <section>
        <h3 className="font-display text-lg">To review ({data.queued.length})</h3>
        {data.queued.length === 0 && <p className="mt-2 text-muted">Nothing waiting. New suggestions arrive with the daily job.</p>}
        <ul className="mt-3 space-y-4">
          {data.queued.map((p) => {
            const caption = captions[p.id] ?? p.caption;
            return (
              <li key={p.id} className="grid gap-4 border border-line p-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/social-image/${p.id}?size=square`} alt="" className="w-full border border-line" />
                  <div className="mt-2 flex gap-3 text-xs">
                    <a href={`/social-image/${p.id}?size=square`} download={`novelist-writer-${p.kind}-square.png`} className="text-accent underline">
                      Square
                    </a>
                    <a href={`/social-image/${p.id}?size=wide`} download={`novelist-writer-${p.kind}-wide.png`} className="text-accent underline">
                      Wide
                    </a>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span className="uppercase tracking-wide text-accent">{KIND[p.kind] || p.kind}</span>
                    <span className="text-muted">suggested {p.suggested_on}</span>
                  </div>
                  <textarea
                    rows={4}
                    value={caption}
                    onChange={(e) => setCaptions((c) => ({ ...c, [p.id]: e.target.value }))}
                    className="mt-2 w-full border border-line bg-paper px-2 py-1.5 text-sm"
                  />
                  <p className="mt-1 text-xs text-muted">
                    {caption.length} characters (Bluesky allows 300) · links to{" "}
                    <a href={p.link_path} target="_blank" rel="noopener noreferrer" className="underline">
                      {p.link_path}
                    </a>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.connected.map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={busy === p.id || Boolean(p.results[n]?.url)}
                        onClick={() => void act(p.id, { caption, post: [n] }, `Posted to ${LABEL[n]}.`)}
                        className="bg-accent px-3 py-1.5 text-paper disabled:opacity-50"
                      >
                        {p.results[n]?.url ? `On ${LABEL[n]} ✓` : `Post to ${LABEL[n]}`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted">Posting by hand? Copy the caption with that network&apos;s tagged link, post it, then mark it:</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {[...data.autoNetworks.filter((n) => !data.connected.includes(n)), ...data.manualNetworks].map((n) => (
                      <span key={n} className="whitespace-nowrap">
                        <button type="button" className="text-accent underline" onClick={() => void navigator.clipboard.writeText(`${caption}\n\n${p.links[n]}`)}>
                          Copy for {LABEL[n]}
                        </button>{" "}
                        <button type="button" disabled={busy === p.id} className="text-muted underline" onClick={() => void act(p.id, { caption, manual: n }, `Marked as posted on ${LABEL[n]}.`)}>
                          posted
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-4 text-xs">
                    <button type="button" disabled={busy === p.id || caption === p.caption} className="text-accent underline disabled:opacity-50" onClick={() => void act(p.id, { caption }, "Caption saved.")}>
                      Save caption
                    </button>
                    <button type="button" disabled={busy === p.id} className="text-danger underline" onClick={() => void act(p.id, { skip: true }, "Skipped.")}>
                      Skip
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {data.recent.length > 0 && (
        <section>
          <h3 className="font-display text-lg">Recent</h3>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {data.recent.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="text-xs uppercase tracking-wide text-accent">{KIND[p.kind] || p.kind}</span> {p.image_title}{" "}
                  <span className="text-xs text-muted">
                    {p.status === "skipped"
                      ? "· skipped"
                      : `· ${Object.entries(p.results)
                          .filter(([, r]) => r.url || r.manual)
                          .map(([n, r]) => (r.url ? LABEL[n] : `${LABEL[n]} (by hand)`))
                          .join(", ")}`}
                  </span>
                </span>
                {p.status === "posted" && (
                  <span className="text-xs text-muted">
                    {p.visitors} visitors · {p.signups} signups
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

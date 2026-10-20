"use client";

import { useEffect, useState } from "react";
import type { LabeledLink } from "@/lib/public-profile";
import { MAX_TROPES } from "@/lib/arc";

type PublishState = {
  title: string;
  genre: string;
  hasBlurb: boolean;
  published: boolean;
  publishedAt: string | null;
  tropes: string[];
  buyLinks: LabeledLink[];
  arcLive: boolean;
  publicUrl: string;
};

const SUGGESTED_STORES = ["Amazon", "Kindle", "Barnes & Noble", "Apple Books", "Kobo", "Bookshop.org"];

export function PublishPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<PublishState | null>(null);
  const [tropesText, setTropesText] = useState("");
  const [buyLinks, setBuyLinks] = useState<LabeledLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function apply(data: PublishState) {
    setState(data);
    setTropesText(data.tropes.join(", "));
    setBuyLinks(data.buyLinks);
  }

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/publish`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Could not load");
        apply(data);
      })
      .catch((err) => setNote(err instanceof Error ? err.message : "Could not load"));
  }, [projectId]);

  async function run(action: "save" | "publish" | "unpublish", ok: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tropes: tropesText, buyLinks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      apply(data);
      setNote(ok);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return <p className="font-ui p-6 text-sm text-muted">{note || "Loading…"}</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="font-ui mx-auto max-w-3xl space-y-8">
          <div>
            <h2 className="font-display text-2xl">Published listing</h2>
            <p className="mt-1 text-sm text-muted">
              List the finished book on the public Published books page with your links and where to
              buy it. Your website and social links come from your{" "}
              <a href="/dashboard/profile" className="text-accent underline">
                public profile
              </a>
              .
            </p>
          </div>

          {note && <p className="text-sm text-ink">{note}</p>}

          <section className="border border-line p-4">
            <h3 className="font-display text-lg">
              {state.published ? "Listed on Published books" : "Not listed"}
            </h3>
            {state.published && (
              <p className="mt-1 text-sm">
                <a href={state.publicUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  View public page
                </a>
              </p>
            )}
            {state.arcLive && !state.published && (
              <p className="mt-2 text-sm text-muted">
                This book is still in its ARC window. You can publish once the ARC ends or its
                deadline passes.
              </p>
            )}
            <ul className="mt-3 space-y-1 text-xs text-muted">
              <li>Genre: {state.genre || "not set (Tools → Project & KDP)"}</li>
              <li>Blurb: {state.hasBlurb ? "set" : "not set (Tools → Project & KDP)"}</li>
            </ul>
          </section>

          <section className="border border-line p-4">
            <label className="block text-sm">
              Tropes
              <input
                value={tropesText}
                onChange={(e) => setTropesText(e.target.value)}
                placeholder="enemies to lovers, found family, slow burn"
                className="mt-1 w-full border border-line bg-paper px-3 py-2"
              />
            </label>
            <p className="mt-1 text-xs text-muted">Comma separated, up to {MAX_TROPES}.</p>

            <p className="mt-6 text-sm text-ink">Where to buy</p>
            <ul className="mt-2 space-y-2">
              {buyLinks.map((l, i) => (
                <li key={i} className="flex flex-wrap gap-2">
                  <input
                    value={l.label}
                    onChange={(e) =>
                      setBuyLinks((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                    placeholder="Store"
                    className="w-40 border border-line bg-paper px-2 py-1.5 text-sm"
                  />
                  <input
                    value={l.url}
                    onChange={(e) =>
                      setBuyLinks((ls) => ls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                    }
                    placeholder="https://…"
                    className="min-w-[14rem] flex-1 border border-line bg-paper px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    className="text-xs text-danger hover:underline"
                    onClick={() => setBuyLinks((ls) => ls.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {SUGGESTED_STORES.filter((s) => !buyLinks.some((l) => l.label === s)).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="border border-line px-2 py-1 text-accent"
                  onClick={() => setBuyLinks((ls) => [...ls, { label: s, url: "" }])}
                >
                  + {s}
                </button>
              ))}
              <button
                type="button"
                className="border border-line px-2 py-1 text-accent"
                onClick={() => setBuyLinks((ls) => [...ls, { label: "", url: "" }])}
              >
                + Other
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                className="border border-line px-4 py-2 text-sm disabled:opacity-50"
                onClick={() => void run("save", "Saved.")}
              >
                Save
              </button>
              {!state.published ? (
                <button
                  type="button"
                  disabled={busy || state.arcLive}
                  className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50"
                  onClick={() => void run("publish", "Published. It's live on the Published books page.")}
                >
                  Publish
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className="text-sm text-danger hover:underline"
                  onClick={() => void run("unpublish", "Removed from Published books.")}
                >
                  Unpublish
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

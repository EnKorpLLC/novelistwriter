"use client";

import { useEffect, useState } from "react";
import { MAX_TROPES, type BuyLink } from "@/lib/arc";
import { ShareKit } from "@/components/ShareKit";

type LaunchState = {
  title: string;
  genre: string;
  hasBlurb: boolean;
  tagline: string;
  releaseDate: string | null;
  launchPublic: boolean;
  published: boolean;
  publishedAt: string | null;
  tropes: string[];
  buyLinks: BuyLink[];
  arcLive: boolean;
  betaOpen: boolean;
  handle: string | null;
  slug: string | null;
  launchPath: string | null;
  launchVisible: boolean;
};

const SUGGESTED_STORES = ["Amazon", "Kindle", "Barnes & Noble", "Apple Books", "Kobo", "Bookshop.org"];

/** The Launch tab: the book's public launch page, its stage, and where to buy or preorder. */
export function PublishPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<LaunchState | null>(null);
  const [tagline, setTagline] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [slug, setSlug] = useState("");
  const [tropesText, setTropesText] = useState("");
  const [buyLinks, setBuyLinks] = useState<BuyLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function apply(data: LaunchState) {
    setState(data);
    setTagline(data.tagline);
    setReleaseDate(data.releaseDate || "");
    setSlug(data.slug || "");
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

  async function run(
    action: "save" | "publish" | "unpublish",
    ok: string,
    extra: Record<string, unknown> = {}
  ) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          tropes: tropesText,
          buyLinks,
          tagline,
          releaseDate: releaseDate || null,
          slug,
          ...extra,
        }),
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

  const stage = state.published
    ? "Out now"
    : state.arcLive
      ? "ARC open"
      : state.betaOpen
        ? "Beta open"
        : state.launchPublic
          ? "Coming soon"
          : "Hidden";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="font-ui mx-auto max-w-3xl space-y-8">
          <div>
            <h2 className="font-display text-2xl">Launch</h2>
            <p className="mt-1 text-sm text-muted">
              Your book&apos;s public launch page. It changes with the book: coming soon, beta or
              ARC open, then out now with buy buttons. Your website and social links come from your{" "}
              <a href="/dashboard/profile" className="text-accent underline">
                public profile
              </a>
              .
            </p>
          </div>

          {note && <p className="text-sm text-ink">{note}</p>}

          <section className="border border-line p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg">
                {state.launchVisible ? `Live · ${stage}` : "Not visible to visitors yet"}
              </h3>
              {state.launchPath && (
                <span className="flex gap-3 text-sm">
                  <a href={state.launchPath} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                    Open page
                  </a>
                  <a
                    href={`${state.launchPath}?preview=visitor`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline"
                  >
                    Preview as visitor
                  </a>
                </span>
              )}
            </div>
            {!state.published && (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={state.launchPublic}
                  disabled={busy}
                  onChange={(e) =>
                    void run(
                      "save",
                      e.target.checked ? "Launch page is live as Coming soon." : "Launch page hidden.",
                      { launchPublic: e.target.checked }
                    )
                  }
                />
                <span>
                  Show the launch page before release
                  <span className="block text-xs text-muted">
                    For cover reveals and preorders. It also goes live on its own while beta or ARC
                    reading is open.
                  </span>
                </span>
              </label>
            )}
            {state.arcLive && !state.published && (
              <p className="mt-3 text-sm text-muted">
                This book is in its ARC window. You can mark it out now once the ARC ends or its
                deadline passes.
              </p>
            )}
            <ul className="mt-3 space-y-1 text-xs text-muted">
              <li>Genre: {state.genre || "not set (Tools → Project & KDP)"}</li>
              <li>Blurb: {state.hasBlurb ? "set" : "not set (Tools → Project & KDP)"}</li>
            </ul>
          </section>

          <section className="space-y-5 border border-line p-4">
            <label className="block text-sm">
              Tagline
              <input
                value={tagline}
                maxLength={160}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="One line that makes someone want the book"
                className="mt-1 w-full border border-line bg-paper px-3 py-2"
              />
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="block text-sm">
                Release date
                <input
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  className="mt-1 block border border-line bg-paper px-3 py-2"
                />
              </label>
              <label className="block min-w-[16rem] flex-1 text-sm">
                Link name
                <span className="mt-1 flex items-center border border-line bg-paper">
                  <span className="whitespace-nowrap px-2 text-xs text-muted">/a/{state.handle || "you"}/</span>
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    className="min-w-0 flex-1 bg-transparent px-1 py-2"
                  />
                </span>
              </label>
            </div>
            <label className="block text-sm">
              Tropes
              <input
                value={tropesText}
                onChange={(e) => setTropesText(e.target.value)}
                placeholder="enemies to lovers, found family, slow burn"
                className="mt-1 w-full border border-line bg-paper px-3 py-2"
              />
              <span className="mt-1 block text-xs text-muted">Comma separated, up to {MAX_TROPES}.</span>
            </label>

            <div>
              <p className="text-sm text-ink">Where to buy</p>
              <p className="text-xs text-muted">
                Tick Preorder for links that should show before release; the rest show once it&apos;s out.
              </p>
              <ul className="mt-2 space-y-2">
                {buyLinks.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
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
                    <label className="flex items-center gap-1 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={Boolean(l.preorder)}
                        onChange={(e) =>
                          setBuyLinks((ls) =>
                            ls.map((x, j) => (j === i ? { ...x, preorder: e.target.checked } : x))
                          )
                        }
                      />
                      Preorder
                    </label>
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
            </div>

            <div className="flex flex-wrap gap-3">
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
                  onClick={() => void run("publish", "Marked out now. It's listed on Published books.")}
                >
                  Mark as out now
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className="text-sm text-danger hover:underline"
                  onClick={() => void run("unpublish", "No longer marked out now.")}
                >
                  Unpublish
                </button>
              )}
            </div>
          </section>

          {state.launchVisible && state.launchPath && (
            <section className="border border-line p-4">
              <ShareKit
                heading="Share your launch page"
                path={state.launchPath}
                title={state.title}
                squareImagePath={`${state.launchPath}/square`}
                posts={[
                  {
                    label: state.published ? "Release" : "Announcement",
                    text: state.published
                      ? `${state.title} is out now!`
                      : `${state.title}${
                          state.releaseDate
                            ? ` is coming ${new Date(`${state.releaseDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}`
                            : " is coming soon"
                        }.`,
                  },
                ]}
                newsletter={{
                  heading: state.title,
                  body: tagline || (state.published ? "Out now." : "Coming soon."),
                  buttonLabel: state.published ? "Get the book" : "See the book",
                }}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

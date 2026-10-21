"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PUBLIC_LINK_FIELDS,
  type LabeledLink,
  type PublicLinkId,
  type PublicLinks,
} from "@/lib/public-profile";
import { AiActionList, TrustBadges } from "@/components/TrustBadges";
import { SITE_THEMES, type SiteThemeId } from "@/lib/site-themes";

export default function PublicProfilePage() {
  const [savedHandle, setSavedHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [theme, setTheme] = useState<SiteThemeId>("paper");
  const [featuredProjectId, setFeaturedProjectId] = useState("");
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
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
        setDisplayName(data.displayName || "");
        setHandle(data.handle || "");
        setSavedHandle(data.handle || "");
        setBio(data.bio || "");
        setTheme(data.theme || "paper");
        setFeaturedProjectId(data.featuredProjectId || "");
        setProjects(data.projects || []);
        setAvatarUrl(data.avatarUrl || null);
        setBannerUrl(data.bannerUrl || null);
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
        body: JSON.stringify({
          displayName,
          handle,
          bio,
          theme,
          featuredProjectId: featuredProjectId || null,
          links: { ...fields, extra },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      apply(data.links || {});
      if (data.handle) setSavedHandle(data.handle);
      setNote("Saved. Your author site and book pages are updated.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function upload(kind: "avatar" | "banner", file: File | null) {
    if (!file) return;
    setUploading(kind);
    setNote(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const res = await fetch("/api/profile/images", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (kind === "avatar") setAvatarUrl(data.url);
      else setBannerUrl(data.url);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function removeImage(kind: "avatar" | "banner") {
    await fetch(`/api/profile/images?kind=${kind}`, { method: "DELETE" });
    if (kind === "avatar") setAvatarUrl(null);
    else setBannerUrl(null);
  }

  const sitePath = savedHandle ? `/a/${savedHandle}` : null;

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <Link href="/dashboard" className="font-ui text-sm text-accent">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-6 text-3xl">Public profile</h1>
      <p className="font-ui mt-2 text-sm text-muted">
        Your author site: photo, bio, links, and every book you&apos;ve made public. The same links
        appear on your beta, ARC, and launch pages.
      </p>
      {sitePath && (
        <div className="font-ui mt-4 flex flex-wrap gap-3">
          <a
            href={`${sitePath}?preview=visitor`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block border border-accent px-4 py-2 text-sm text-accent hover:bg-accent hover:text-paper"
          >
            See what visitors see →
          </a>
          <a href={sitePath} target="_blank" rel="noopener noreferrer" className="self-center text-sm text-accent underline">
            Open my site and share tools
          </a>
        </div>
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
        <label className="block text-sm">
          Handle
          <span className="mt-1 flex items-center border border-line bg-paper">
            <span className="px-2 text-xs text-muted">novelistwriter.com/a/</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="min-w-0 flex-1 bg-transparent px-1 py-2"
            />
          </span>
          {savedHandle && handle !== savedHandle && (
            <span className="mt-1 block text-xs text-muted">
              Changing it breaks links you&apos;ve already shared with the old handle.
            </span>
          )}
        </label>
        <label className="block text-sm">
          Bio
          <textarea
            rows={5}
            maxLength={2000}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A few lines about you and what you write"
            className="mt-1 w-full border border-line bg-paper px-3 py-2"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["avatar", "Author photo", avatarUrl],
              ["banner", "Banner image", bannerUrl],
            ] as const
          ).map(([kind, label, url]) => (
            <div key={kind} className="text-sm">
              <p>{label}</p>
              {url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt=""
                  className={`mt-1 border border-line object-cover ${kind === "avatar" ? "h-20 w-20 rounded-full" : "h-20 w-full"}`}
                />
              )}
              <div className="mt-1 flex items-center gap-3 text-xs">
                <label className="cursor-pointer text-accent underline">
                  {uploading === kind ? "Uploading…" : url ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => void upload(kind, e.target.files?.[0] || null)}
                  />
                </label>
                {url && (
                  <button type="button" className="text-danger hover:underline" onClick={() => void removeImage(kind)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <fieldset className="text-sm">
          <legend>Site theme</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(Object.keys(SITE_THEMES) as SiteThemeId[]).map((id) => (
              <label
                key={id}
                className={`flex cursor-pointer items-center gap-2 border px-3 py-1.5 ${theme === id ? "border-accent" : "border-line"}`}
              >
                <input type="radio" name="theme" checked={theme === id} onChange={() => setTheme(id)} />
                {SITE_THEMES[id].label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm">
          Featured book
          <select
            value={featuredProjectId}
            onChange={(e) => setFeaturedProjectId(e.target.value)}
            className="mt-1 block w-full border border-line bg-paper px-3 py-2"
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">
            Shown at the top of your site once its launch page is public (Launch tab).
          </span>
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
  aiActions: { label: string; count: number }[];
  aiDisclosurePublic: boolean;
  shownOn: { label: string; href: string }[];
};

function BadgeOverview() {
  const [data, setData] = useState<{ aiOffSince: string | null; books: BadgeBook[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function setDisclosure(projectId: string, disclose: boolean) {
    setSavingId(projectId);
    setError(null);
    try {
      const res = await fetch("/api/profile/badges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, disclose }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setData((d) =>
        d
          ? {
              ...d,
              books: d.books.map((b) =>
                b.projectId === projectId ? { ...b, aiDisclosurePublic: disclose } : b
              ),
            }
          : d
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingId(null);
    }
  }

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
                      <>
                        <p className="text-xs text-muted">
                          No &ldquo;No AI used&rdquo; badge: AI was run on this book
                          {b.aiUsedAt ? ` (first on ${new Date(b.aiUsedAt).toLocaleDateString()})` : ""}.
                        </p>
                        <AiActionList actions={b.aiActions} className="mt-1" />
                        {b.aiActions.length > 0 && (
                          <label className="mt-2 flex items-start gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={b.aiDisclosurePublic}
                              disabled={savingId === b.projectId}
                              onChange={(e) => void setDisclosure(b.projectId, e.target.checked)}
                            />
                            <span className="text-muted">
                              Show this list on the book&apos;s public pages. Only the action names
                              appear, never what the AI said.
                            </span>
                          </label>
                        )}
                      </>
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
                      "Not public yet. Badges appear once its launch page is public (Launch tab), or while beta or ARC reading is open."
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

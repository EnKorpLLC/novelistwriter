"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthorConnect, AuthorLinks } from "@/components/AuthorConnect";
import type { LabeledLink } from "@/lib/public-profile";
import type { MailingAddress } from "@/lib/arc";

type ReviewLink = LabeledLink & { key: string };

type ArcData = {
  projectId: string;
  title: string;
  genre: string;
  blurb: string;
  coverUrl: string | null;
  authorUserId: string;
  authorName: string;
  authorLinks: LabeledLink[];
  deadline: string | null;
  windowOpen: boolean;
  deadlinePassed: boolean;
  loggedIn: boolean;
  access: "login_required" | "author" | "request" | "pending" | "removed" | "closed" | "active" | "ended";
  email?: string | null;
  subscribed?: boolean;
  canSubscribe?: boolean;
  message?: string;
  displayName?: string | null;
  finishedAt?: string | null;
  reviewBody?: string;
  reviewPosts?: Record<string, string>;
  reviewLinks?: ReviewLink[];
  collectAddress?: boolean;
  mailingAddress?: MailingAddress | null;
  currentChapterId?: string | null;
  chapters?: { id: string; title: string; content_html: string }[];
};

const EMPTY_ADDRESS: MailingAddress = {
  name: "",
  street: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  note: "",
};

function deadlineLabel(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ArcBookClient({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ArcData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [active, setActive] = useState("");
  const [review, setReview] = useState("");
  const [posts, setPosts] = useState<Record<string, string>>({});
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const [address, setAddress] = useState<MailingAddress>(EMPTY_ADDRESS);
  const [savedAddress, setSavedAddress] = useState<MailingAddress | null>(null);
  const [addressOpen, setAddressOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/arc/session/${projectId}`);
      const json = (await res.json()) as ArcData & { error?: string };
      if (!res.ok) throw new Error(json.error || "Not found");
      setData(json);
      setReview(json.reviewBody || "");
      setPosts(json.reviewPosts || {});
      setFinishedAt(json.finishedAt || null);
      setSavedAddress(json.mailingAddress || null);
      setAddress(json.mailingAddress || EMPTY_ADDRESS);
      if (json.chapters?.length) {
        const start =
          json.currentChapterId && json.chapters.some((c) => c.id === json.currentChapterId)
            ? json.currentChapterId
            : json.chapters[0].id;
        setActive(start);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch(`/api/arc/session/${projectId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  function goToChapter(id: string) {
    setActive(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
    void post({ action: "progress", chapterId: id }).catch(() => null);
  }

  async function requestCopy(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await post({ action: "request", displayName: requestName });
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not send request");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setNote(null);
    try {
      const json = await post({ action: "finish", review });
      setFinishedAt(json.finishedAt);
      setNote("Marked finished. Thank you! Use the buttons below to post your review.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function togglePosted(key: string, posted: boolean) {
    try {
      const json = await post({ action: "markPosted", site: key, posted });
      setPosts(json.reviewPosts || {});
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function saveAddress(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const json = await post({ action: "saveAddress", address });
      setSavedAddress(json.mailingAddress);
      setAddressOpen(false);
      setNote("Address saved. Only the author can see it.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save address");
    } finally {
      setBusy(false);
    }
  }

  async function copyReview() {
    try {
      await navigator.clipboard.writeText(review);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNote("Couldn't copy. Select the text and copy it manually.");
    }
  }

  if (loading) return <p className="font-ui text-sm text-muted">Loading…</p>;
  if (error || !data) {
    return (
      <div className="font-ui space-y-3">
        <p className="text-sm text-danger">{error || "Not found"}</p>
        <Link href="/beta/dashboard" className="text-sm text-accent underline">
          Reader dashboard
        </Link>
      </div>
    );
  }

  const due = deadlineLabel(data.deadline);
  const chapters = data.chapters || [];
  const idx = chapters.findIndex((c) => c.id === active);
  const chapter = idx >= 0 ? chapters[idx] : null;
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;
  const isLast = chapters.length > 0 && idx === chapters.length - 1;
  const loginNext = encodeURIComponent(`/arc/book/${projectId}`);
  const reviewLinks = data.reviewLinks || [];

  const reviewSection = (
    <section className="font-ui mt-8 border border-line p-5">
      <h2 className="font-display text-xl">Leave your review</h2>
      <p className="mt-1 text-sm text-muted">
        Each button opens the store&apos;s review page in a new tab.
        {review.trim() ? " Copy your note first, then paste it there." : ""}
      </p>
      {review.trim() && (
        <button
          type="button"
          onClick={() => void copyReview()}
          className="mt-3 border border-line px-3 py-1.5 text-sm text-accent"
        >
          {copied ? "Copied" : "Copy review"}
        </button>
      )}
      {reviewLinks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">The author hasn&apos;t added review links yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reviewLinks.map((l) => (
            <li key={l.key} className="flex flex-wrap items-center gap-4">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-accent px-4 py-2 text-sm text-paper"
              >
                Leave a review on {l.label}
              </a>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={Boolean(posts[l.key])}
                  onChange={(e) => void togglePosted(l.key, e.target.checked)}
                />
                I posted this
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const addressSection = data.collectAddress ? (
    <section className="font-ui mt-8 border border-line p-5">
      <h2 className="font-display text-xl">Mailing address</h2>
      <p className="mt-1 text-sm text-muted">
        Optional. {data.authorName} may send a physical copy or a thank-you gift. Only the author
        sees this.
      </p>
      {savedAddress && !addressOpen ? (
        <div className="mt-3 text-sm">
          <p className="text-ink">
            {savedAddress.name}, {savedAddress.street}, {savedAddress.city}
            {savedAddress.region ? `, ${savedAddress.region}` : ""}
            {savedAddress.postalCode ? ` ${savedAddress.postalCode}` : ""}, {savedAddress.country}
          </p>
          <div className="mt-2 flex gap-3">
            <button type="button" className="text-accent underline" onClick={() => setAddressOpen(true)}>
              Edit
            </button>
            <button
              type="button"
              className="text-muted underline"
              onClick={() =>
                void post({ action: "saveAddress", address: null }).then(() => {
                  setSavedAddress(null);
                  setAddress(EMPTY_ADDRESS);
                })
              }
            >
              Remove
            </button>
          </div>
        </div>
      ) : !addressOpen ? (
        <button
          type="button"
          className="mt-3 border border-line px-3 py-1.5 text-sm text-accent"
          onClick={() => setAddressOpen(true)}
        >
          Add my address
        </button>
      ) : (
        <form onSubmit={(e) => void saveAddress(e)} className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["name", "Name", true],
              ["street", "Street address", true],
              ["city", "City", true],
              ["region", "State / region", false],
              ["postalCode", "Postal code", false],
              ["country", "Country", true],
            ] as const
          ).map(([key, label, required]) => (
            <label key={key} className={`block text-sm ${key === "street" ? "sm:col-span-2" : ""}`}>
              {label}
              <input
                required={required}
                value={address[key]}
                onChange={(e) => setAddress((a) => ({ ...a, [key]: e.target.value }))}
                className="mt-1 w-full border border-line bg-paper px-3 py-2"
              />
            </label>
          ))}
          <label className="block text-sm sm:col-span-2">
            Note for the author (optional)
            <input
              value={address.note}
              onChange={(e) => setAddress((a) => ({ ...a, note: e.target.value }))}
              className="mt-1 w-full border border-line bg-paper px-3 py-2"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-60">
              Save address
            </button>
            <button type="button" className="border border-line px-4 py-2 text-sm" onClick={() => setAddressOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  ) : null;

  return (
    <div>
      <div className="font-ui flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/beta/dashboard" className="text-accent underline">
          Reader dashboard
        </Link>
        <span className="text-xs uppercase tracking-wide text-muted">Advance reader copy</span>
      </div>

      <div className="mt-6 flex gap-5">
        {data.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.coverUrl} alt="" className="h-36 w-24 shrink-0 border border-line object-cover" />
        )}
        <div className="min-w-0">
          <h1 className="font-display text-3xl">{data.title}</h1>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/authors/${data.authorUserId}`} className="hover:text-ink">
              {data.authorName}
            </Link>{" "}
            · {data.genre}
          </p>
          {due && (
            <p className={`font-ui mt-2 text-sm ${data.deadlinePassed ? "text-danger" : "text-ink"}`}>
              {data.deadlinePassed ? `ARC window ended ${due}` : `Read by ${due}`}
            </p>
          )}
          <AuthorLinks links={data.authorLinks} className="mt-2" />
          {data.loggedIn && data.access !== "author" && (
            <div className="mt-3">
              <AuthorConnect
                authorUserId={data.authorUserId}
                authorName={data.authorName}
                initialSubscribed={Boolean(data.subscribed)}
                canSubscribe={Boolean(data.canSubscribe)}
              />
            </div>
          )}
        </div>
      </div>

      {note && <p className="font-ui mt-6 text-sm text-ink">{note}</p>}

      {data.access === "login_required" && (
        <div className="font-ui mt-8 border border-line p-5">
          <p className="text-sm text-ink">
            {data.windowOpen
              ? "Sign in with the email your ARC was sent to, or create a free reader account to request a copy."
              : "This book isn't taking ARC readers right now."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href={`/login?next=${loginNext}`} className="bg-accent px-4 py-2 text-paper">
              Log in
            </Link>
            <Link href={`/beta/signup?next=${loginNext}`} className="border border-line px-4 py-2 text-accent">
              Create reader account
            </Link>
          </div>
        </div>
      )}

      {data.access === "author" && (
        <p className="font-ui mt-8 text-sm text-muted">
          This is your book. Manage ARC readers from the{" "}
          <Link href={`/project/${projectId}?tab=arc`} className="text-accent underline">
            ARC tab
          </Link>
          .
        </p>
      )}

      {data.access === "request" && (
        <form onSubmit={(e) => void requestCopy(e)} className="font-ui mt-8 space-y-3 border border-line p-5">
          <h2 className="font-display text-xl">Request an advance copy</h2>
          {data.blurb && <p className="whitespace-pre-wrap text-sm text-ink">{data.blurb}</p>}
          <p className="text-sm text-muted">
            The author reviews requests. If approved, you can read until {due || "the deadline"}.
          </p>
          <label className="block text-sm">
            Name the author should see
            <input
              required
              value={requestName}
              onChange={(e) => setRequestName(e.target.value)}
              className="mt-1 w-full border border-line bg-paper px-3 py-2"
            />
          </label>
          <p className="text-xs text-muted">Requesting as {data.email}</p>
          <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-60">
            {busy ? "Sending…" : "Request a copy"}
          </button>
        </form>
      )}

      {data.access === "pending" && (
        <p className="font-ui mt-8 text-sm text-ink">
          Request sent. You&apos;ll get a notification and an email when the author approves it.
        </p>
      )}

      {(data.access === "removed" || data.access === "closed") && (
        <p className="font-ui mt-8 text-sm text-muted">
          {data.message || "This book isn't taking ARC readers right now. Follow the author to hear when it opens."}
        </p>
      )}

      {data.access === "ended" && (
        <>
          <p className="font-ui mt-8 border border-line bg-paper-deep/40 px-4 py-3 text-sm text-ink">
            The ARC reading window has ended, so the manuscript is closed. You can still leave your
            review below.
          </p>
          {reviewSection}
          {addressSection}
        </>
      )}

      {data.access === "active" && (
        <>
          {chapters.length > 0 && (
            <label className="font-ui mt-8 block text-[10px] uppercase tracking-wide text-muted">
              Chapter
              <select
                className="mt-1 block w-full border border-line bg-paper px-3 py-2 text-sm text-ink"
                value={active}
                onChange={(e) => goToChapter(e.target.value)}
              >
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <h2 className="font-display mt-6 text-2xl">{chapter?.title || "Chapter"}</h2>
          <article
            className="manuscript-prose mt-4 max-w-none"
            dangerouslySetInnerHTML={{ __html: chapter?.content_html || "<p>Empty</p>" }}
          />
          <div className="font-ui mt-10 flex flex-wrap justify-between gap-2 border-t border-line pt-6">
            <button
              type="button"
              disabled={!prev}
              onClick={() => prev && goToChapter(prev.id)}
              className="border border-line px-4 py-2 text-sm disabled:opacity-30"
            >
              ← Previous chapter
            </button>
            <button
              type="button"
              disabled={!next}
              onClick={() => next && goToChapter(next.id)}
              className="border border-line px-4 py-2 text-sm disabled:opacity-30"
            >
              Next chapter →
            </button>
          </div>

          {(isLast || finishedAt) && (
            <section className="font-ui mt-10 border border-line p-5">
              <h2 className="font-display text-xl">
                {finishedAt ? "You finished. Thank you!" : "Finished the book?"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Jot down your review here if you like. It stays private to the author, and you can
                copy it straight onto Amazon or Goodreads.
              </p>
              <textarea
                rows={5}
                value={review}
                onChange={(e) => setReview(e.target.value)}
                className="mt-3 w-full border border-line bg-paper p-3 text-sm"
                placeholder="What did you think?"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void finish()}
                className="mt-2 bg-accent px-4 py-2 text-sm text-paper disabled:opacity-60"
              >
                {finishedAt ? "Save review" : "Mark finished"}
              </button>
            </section>
          )}

          {finishedAt && reviewSection}
          {addressSection}
        </>
      )}
    </div>
  );
}

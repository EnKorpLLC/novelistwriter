"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FontId } from "@/lib/book/styles";
import { loadCoverFonts } from "@/lib/book/cover-design";
import { canvasBlob, downloadBlob } from "@/lib/book/cover-template";
import { PROMO_SIZES, averageColor, drawPromoCard, type PromoCard, type PromoSize } from "@/lib/book/marketing";

type Book = { id: string; title: string; author: string; coverUrl: string | null; heading: FontId; body: FontId };
type Post = { id: string; project_id: string | null; post_on: string; network: string; body: string; card: string; status: "planned" | "posted" | "skipped" };
type Data = {
  pro: boolean;
  studio: boolean;
  today: string;
  migrationNeeded: boolean;
  books: Book[];
  progress: { today: number; week: number; month: number; streak: number; challenge: { title: string; verified: number; goal: number } | null };
  posts: Post[];
};
type Kind = "quote" | "review" | "progress";

const NETWORKS: { id: string; label: string; intent?: (t: string) => string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X", intent: (t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}` },
  { id: "threads", label: "Threads", intent: (t) => `https://www.threads.net/intent/post?text=${encodeURIComponent(t)}` },
  { id: "bluesky", label: "Bluesky", intent: (t) => `https://bsky.app/intent/compose?text=${encodeURIComponent(t)}` },
  { id: "linkedin", label: "LinkedIn" },
  { id: "newsletter", label: "Newsletter" },
  { id: "any", label: "Anywhere" },
];

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function MarketingPage() {
  const [data, setData] = useState<Data | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [bookId, setBookId] = useState("");
  const [kind, setKind] = useState<Kind>("quote");
  const [size, setSize] = useState<PromoSize>("square");
  const [quote, setQuote] = useState("");
  const [fromBook, setFromBook] = useState(false);
  const [reviews, setReviews] = useState<{ text: string; firstName: string | null }[] | null>(null);
  const [review, setReview] = useState({ text: "", attribution: "Advance reader" });
  const [stat, setStat] = useState<"week" | "month" | "today" | "streak" | "challenge">("week");
  const [progressText, setProgressText] = useState({ headline: "", detail: "" });
  const [colors, setColors] = useState({ bg: "#1d2633", fg: "#f6f1e7", accent: "#d9b26f" });
  const [cover, setCover] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [draft, setDraft] = useState({ post_on: "", network: "instagram", body: "", card: "none" });
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  async function load() {
    const res = await fetch("/api/marketing");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(json.error || "Could not load");
      return;
    }
    setData(json);
    setBookId((b) => b || json.books[0]?.id || "");
    setDraft((d) => ({ ...d, post_on: d.post_on || json.today }));
    if (json.migrationNeeded) setNote("Database needs an update. Run supabase/migration_author_marketing.sql in the Supabase SQL editor.");
  }

  useEffect(() => {
    void load();
    void loadCoverFonts().then(() => setFontsReady(true));
  }, []);

  const book = data?.books.find((b) => b.id === bookId) || null;

  useEffect(() => {
    setCover(null);
    if (!book?.coverUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setCover(img);
      setColors((c) => ({ ...c, bg: averageColor(img) }));
    };
    img.src = `${book.coverUrl}${book.coverUrl.includes("?") ? "&" : "?"}m=1`;
  }, [book?.coverUrl]);

  useEffect(() => {
    if (kind !== "review" || !bookId || !data?.studio) return;
    setReviews(null);
    void fetch(`/api/marketing/reviews?projectId=${bookId}`)
      .then(async (r) => (r.ok ? setReviews((await r.json()).reviews) : setReviews([])))
      .catch(() => setReviews([]));
  }, [kind, bookId, data?.studio]);

  // Progress wording comes from verified numbers; the author can edit it
  useEffect(() => {
    if (!data) return;
    const p = data.progress;
    const n = (x: number) => x.toLocaleString();
    const headline =
      stat === "today"
        ? `${n(p.today)} words today`
        : stat === "week"
          ? `${n(p.week)} words this week`
          : stat === "month"
            ? `${n(p.month)} words this month`
            : stat === "streak"
              ? `${p.streak}-day writing streak`
              : p.challenge
                ? `${n(p.challenge.verified)} of ${n(p.challenge.goal)} words`
                : "No active challenge";
    const detail = stat === "challenge" && p.challenge ? p.challenge.title : p.streak > 1 && stat !== "streak" ? `${p.streak} days in a row` : "Every word typed, none pasted";
    setProgressText({ headline, detail });
  }, [stat, data]);

  const card: PromoCard = useMemo(
    () =>
      kind === "quote"
        ? { kind, text: quote || "Pick a line readers will remember.", fromBook }
        : kind === "review"
          ? { kind, text: review.text || "Choose a review to quote.", attribution: review.attribution }
          : { kind, headline: progressText.headline, detail: progressText.detail, project: book?.title || "" },
    [kind, quote, fromBook, review, progressText, book?.title]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !book) return;
    const s = PROMO_SIZES[size];
    canvas.width = s.w;
    canvas.height = s.h;
    const ctx = canvas.getContext("2d");
    if (ctx) drawPromoCard(ctx, size, card, { ...colors, heading: book.heading, body: book.body, title: book.title, author: book.author }, cover);
  }, [card, size, colors, cover, book, fontsReady]);

  async function checkQuote() {
    if (!quote.trim() || !bookId) return;
    const res = await fetch("/api/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: bookId, text: quote }) });
    const json = await res.json().catch(() => ({}));
    setFromBook(Boolean(json.found));
  }

  const canDownload = data?.pro && (kind !== "review" || data.studio);

  async function download() {
    if (!canvasRef.current || !book) return;
    const blob = await canvasBlob(canvasRef.current, "image/png");
    downloadBlob(blob, `${book.title.replace(/[^\w\- ]+/g, "").trim() || "book"}-${kind}-${size}.png`);
  }

  async function addPost(p: typeof draft) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/marketing/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, project_id: bookId || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not add the post");
      setData((d) => (d ? { ...d, posts: [...d.posts, json.post].sort((a, b) => a.post_on.localeCompare(b.post_on)) } : d));
      setDraft((d) => ({ ...d, body: "" }));
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not add the post");
    } finally {
      setBusy(false);
    }
  }

  async function patchPost(id: string, patch: Partial<Post>) {
    setData((d) => (d ? { ...d, posts: d.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : d));
    await fetch("/api/marketing/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
  }

  async function removePost(id: string) {
    setData((d) => (d ? { ...d, posts: d.posts.filter((p) => p.id !== id) } : d));
    await fetch(`/api/marketing/posts?id=${id}`, { method: "DELETE" });
  }

  if (!data) return <p className="font-ui p-10 text-sm text-muted">{note || "Loading…"}</p>;

  const input = "mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink";
  const overdue = data.posts.filter((p) => p.status === "planned" && p.post_on < data.today);
  const upcoming = data.posts.filter((p) => p.post_on >= data.today);
  const days = [...new Set(upcoming.map((p) => p.post_on))];
  const titleOf = (id: string | null) => data.books.find((b) => b.id === id)?.title;

  const postRow = (p: Post) => {
    const net = NETWORKS.find((n) => n.id === p.network);
    return (
      <li key={p.id} className={`border border-line p-3 text-sm ${p.status !== "planned" ? "opacity-60" : ""}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-ink">
            {net?.label || "Anywhere"}
            {titleOf(p.project_id) ? <span className="text-muted"> · {titleOf(p.project_id)}</span> : null}
            {p.card !== "none" ? <span className="text-muted"> · with a {p.card} card</span> : null}
          </span>
          <span className="text-xs text-muted">{p.status === "posted" ? "Posted" : p.status === "skipped" ? "Skipped" : ""}</span>
        </div>
        {p.body && <p className="mt-1 whitespace-pre-wrap text-muted">{p.body}</p>}
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {net?.intent && p.body && (
            <a href={net.intent(p.body)} target="_blank" rel="noopener noreferrer" className="text-accent underline" onClick={() => void patchPost(p.id, { status: "posted" })}>
              Post on {net.label}
            </a>
          )}
          {p.body && (
            <button type="button" className="text-accent underline" onClick={() => void navigator.clipboard.writeText(p.body)}>
              Copy text
            </button>
          )}
          {p.status === "planned" ? (
            <>
              <button type="button" className="text-accent underline" onClick={() => void patchPost(p.id, { status: "posted" })}>
                Mark posted
              </button>
              <button type="button" className="text-muted underline" onClick={() => void patchPost(p.id, { status: "skipped" })}>
                Skip
              </button>
            </>
          ) : (
            <button type="button" className="text-muted underline" onClick={() => void patchPost(p.id, { status: "planned" })}>
              Undo
            </button>
          )}
          <button type="button" className="text-danger underline" onClick={() => void removePost(p.id)}>
            Delete
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="font-ui mx-auto min-h-screen max-w-6xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-accent hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-3 text-3xl">Marketing</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Posts made from things only you have: lines from your book, real reader reviews, and writing progress we can verify.
        Nothing here is written by AI. Plan them on the calendar and we&apos;ll remind you on the day.
      </p>
      {note && <p className="mt-3 text-sm text-danger">{note}</p>}
      {!data.pro && (
        <div className="mt-4 border border-accent/40 bg-accent/5 p-3 text-sm">
          Try the card maker free. Downloading cards and the posting calendar are part of Pro and Studio.{" "}
          <a href="/billing" className="text-accent underline">
            Get Pro
          </a>
        </div>
      )}

      {data.books.length === 0 ? (
        <p className="mt-8 text-sm text-muted">Create a book first, then come back to make posts for it.</p>
      ) : (
        <section className="mt-8 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="space-y-4 text-sm">
            <label className="block text-xs text-muted">
              Book
              <select value={bookId} onChange={(e) => setBookId(e.target.value)} className={input}>
                {data.books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2 text-xs">
              {(
                [
                  ["quote", "Quote"],
                  ["review", "Review"],
                  ["progress", "Progress"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`border px-3 py-1.5 ${kind === k ? "border-accent bg-accent/5 text-ink" : "border-line text-muted"}`}>
                  {label}
                  {k === "review" ? " (Studio)" : ""}
                </button>
              ))}
            </div>

            {kind === "quote" && (
              <label className="block text-xs text-muted">
                A line or short passage from your book
                <textarea
                  rows={5}
                  value={quote}
                  onChange={(e) => {
                    setQuote(e.target.value);
                    setFromBook(false);
                  }}
                  onBlur={() => void checkQuote()}
                  className={input}
                  placeholder="Paste it exactly as it appears in the book"
                />
                <span className="mt-1 block">
                  {fromBook ? "✓ Found in your book, so the card says “From the book”." : "Paste it exactly and we'll confirm it's from the book."}
                </span>
              </label>
            )}

            {kind === "review" &&
              (!data.studio ? (
                <p className="text-xs text-muted">
                  Review cards quote your ARC readers and are part of Studio.{" "}
                  <a href="/billing" className="text-accent underline">
                    Get Studio
                  </a>
                </p>
              ) : (
                <>
                  {reviews === null ? (
                    <p className="text-xs text-muted">Loading reviews…</p>
                  ) : reviews.length === 0 ? (
                    <p className="text-xs text-muted">No ARC reviews for this book yet. You can paste a review below, with the reviewer&apos;s permission.</p>
                  ) : (
                    <ul className="max-h-48 space-y-1 overflow-y-auto">
                      {reviews.map((r, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            className="w-full border border-line p-2 text-left text-xs hover:border-accent"
                            onClick={() => setReview({ text: r.text.slice(0, 400), attribution: r.firstName ? `${r.firstName}, advance reader` : "Advance reader" })}
                          >
                            {r.text.slice(0, 140)}
                            {r.text.length > 140 ? "…" : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <label className="block text-xs text-muted">
                    Review text (trim it to the best part)
                    <textarea rows={4} value={review.text} onChange={(e) => setReview((r) => ({ ...r, text: e.target.value }))} className={input} />
                  </label>
                  <label className="block text-xs text-muted">
                    Attribution
                    <input value={review.attribution} onChange={(e) => setReview((r) => ({ ...r, attribution: e.target.value }))} className={input} />
                  </label>
                </>
              ))}

            {kind === "progress" && (
              <>
                <label className="block text-xs text-muted">
                  Show
                  <select value={stat} onChange={(e) => setStat(e.target.value as typeof stat)} className={input}>
                    <option value="today">Words today ({data.progress.today.toLocaleString()})</option>
                    <option value="week">Words this week ({data.progress.week.toLocaleString()})</option>
                    <option value="month">Words this month ({data.progress.month.toLocaleString()})</option>
                    <option value="streak">Writing streak ({data.progress.streak} days)</option>
                    {data.progress.challenge && <option value="challenge">Challenge progress</option>}
                  </select>
                </label>
                <label className="block text-xs text-muted">
                  Second line
                  <input value={progressText.detail} onChange={(e) => setProgressText((p) => ({ ...p, detail: e.target.value }))} className={input} />
                </label>
                <p className="text-xs text-muted">The number comes from your writing record and can&apos;t be edited, so the card stays honest.</p>
              </>
            )}

            <label className="block text-xs text-muted">
              Size
              <select value={size} onChange={(e) => setSize(e.target.value as PromoSize)} className={input}>
                {(Object.keys(PROMO_SIZES) as PromoSize[]).map((s) => (
                  <option key={s} value={s}>
                    {PROMO_SIZES[s].label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-3 text-xs text-muted">
              {(["bg", "fg", "accent"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1">
                  {k === "bg" ? "Background" : k === "fg" ? "Text" : "Accent"}
                  <input type="color" value={colors[k]} onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))} />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!canDownload} onClick={() => void download()} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50">
                Download image
              </button>
              <button
                type="button"
                disabled={!data.pro}
                onClick={() => {
                  setDraft((d) => ({ ...d, card: kind, body: kind === "quote" && quote ? `“${quote.trim()}” — from ${book?.title}` : d.body }));
                  document.getElementById("calendar")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="border border-line px-4 py-2 text-sm disabled:opacity-50"
              >
                Plan a post with it
              </button>
            </div>
          </div>
          <div className="flex items-start justify-center rounded bg-paper-deep/40 p-4">
            <canvas ref={canvasRef} className="max-h-[36rem] max-w-full shadow-lg" style={{ aspectRatio: `${PROMO_SIZES[size].w} / ${PROMO_SIZES[size].h}` }} />
          </div>
        </section>
      )}

      <section id="calendar" className="mt-14">
        <h2 className="font-display text-2xl">Posting calendar</h2>
        <p className="mt-1 text-sm text-muted">
          Plan posts and we&apos;ll remind you on the day in the app, and by email if you&apos;ve turned on notification emails in
          Settings. X, Threads, and Bluesky open ready to post; for the others, copy the text and attach your card.
        </p>
        {data.pro && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addPost(draft);
            }}
            className="mt-4 grid gap-3 border border-line p-4 sm:grid-cols-[9rem_9rem_minmax(0,1fr)_auto]"
          >
            <label className="text-xs text-muted">
              Day
              <input type="date" required min={data.today} value={draft.post_on} onChange={(e) => setDraft((d) => ({ ...d, post_on: e.target.value }))} className={input} />
            </label>
            <label className="text-xs text-muted">
              Where
              <select value={draft.network} onChange={(e) => setDraft((d) => ({ ...d, network: e.target.value }))} className={input}>
                {NETWORKS.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Post text
              <textarea rows={2} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} className={input} placeholder="What you'll say, in your own words" />
            </label>
            <div className="flex items-end">
              <button type="submit" disabled={busy} className="bg-accent px-4 py-2 text-sm text-paper disabled:opacity-50">
                Add
              </button>
            </div>
          </form>
        )}

        {overdue.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm text-danger">Missed ({overdue.length})</h3>
            <ul className="mt-2 space-y-2">{overdue.map(postRow)}</ul>
          </div>
        )}
        {days.length === 0 ? (
          <p className="mt-6 text-sm text-muted">Nothing planned yet. A post or two a week is plenty.</p>
        ) : (
          days.map((day) => (
            <div key={day} className="mt-6">
              <h3 className="text-sm text-ink">
                {day === data.today ? "Today" : day === addDays(data.today, 1) ? "Tomorrow" : fmtDay(day)}
              </h3>
              <ul className="mt-2 space-y-2">{upcoming.filter((p) => p.post_on === day).map(postRow)}</ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

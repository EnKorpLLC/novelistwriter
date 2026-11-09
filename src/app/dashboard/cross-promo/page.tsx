"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type BookCard = { id: string; title: string; genre: string; coverUrl: string | null; url: string | null; authorName: string };
type SwapData = {
  studio: boolean;
  migrationNeeded?: boolean;
  today: string;
  listing: { project_id: string | null; genres: string; note: string; open: boolean } | null;
  myListRange: string;
  myBooks: { id: string; title: string }[];
  board: { userId: string; book: BookCard; genres: string; note: string; listRange: string; listSize: number; completed: number }[];
  swaps: {
    id: string;
    role: "from" | "to";
    status: "requested" | "accepted" | "declined" | "cancelled";
    message: string;
    partnerName: string;
    partnerListRange: string;
    partnerCompleted: number;
    myBook: { title: string } | null;
    theirBook: { title: string; url: string | null; coverUrl: string | null } | null;
    mySendOn: string;
    theirSendOn: string;
    iSent: boolean;
    theySent: boolean;
    myLink: string | null;
    visitorsFromMe: number;
    visitorsFromThem: number;
  }[];
};
type Promo = {
  id: string;
  slug: string;
  title: string;
  genre: string;
  description: string;
  startsOn: string;
  endsOn: string;
  applyBy: string;
  maxBooks: number;
  status: string;
  hostName: string;
  isHost: boolean;
  approved: number;
  waiting: number;
  mine: { projectId: string; status: string; priceNote: string }[];
};
type PromoData = { pro: boolean; studio: boolean; migrationNeeded?: boolean; today: string; myBooks: { id: string; title: string }[]; open: Promo[]; hosting: Promo[]; joined: Promo[] };
type PromoDetail = {
  promo: { id: string; slug: string; title: string; url: string; startsOn: string; endsOn: string; maxBooks: number; status: string };
  isHost: boolean;
  shareLink: string;
  visitors: number;
  books: { projectId: string; mine: boolean; status: string; priceNote: string; title: string; authorName: string; coverUrl: string | null; url: string | null; shared: number; clicks: number }[];
};

const input = "mt-1 block w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink";
const MIGRATION = "Database needs an update. Run supabase/migration_cross_promo.sql in the Supabase SQL editor.";

function fmt(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function plusDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json;
}

function Cover({ url, title }: { url: string | null; title: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={title} className="h-24 w-16 shrink-0 object-cover shadow" />
  ) : (
    <div className="flex h-24 w-16 shrink-0 items-center justify-center bg-paper-deep p-1 text-center text-[10px]">{title}</div>
  );
}

function Swaps() {
  const [data, setData] = useState<SwapData | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [listing, setListing] = useState({ projectId: "", genres: "", note: "", open: true });
  const [asking, setAsking] = useState<string | null>(null);
  const [ask, setAsk] = useState({ projectId: "", mySendOn: "", theirSendOn: "", message: "" });
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/cross-promo/swaps");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setNote(json.error || "Could not load swaps");
    setData(json);
    if (json.listing) setListing({ projectId: json.listing.project_id || "", genres: json.listing.genres, note: json.listing.note, open: json.listing.open });
    else if (json.myBooks?.[0]) setListing((l) => ({ ...l, projectId: l.projectId || json.myBooks[0].id }));
    setAsk((a) => ({ ...a, projectId: a.projectId || json.myBooks?.[0]?.id || "", mySendOn: a.mySendOn || plusDays(json.today, 14), theirSendOn: a.theirSendOn || plusDays(json.today, 14) }));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setNote(null);
    try {
      await fn();
      if (done) setNote(done);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  if (!data) return <p className="mt-6 text-sm text-muted">{note || "Loading…"}</p>;
  if (data.migrationNeeded) return <p className="mt-6 text-sm text-danger">{MIGRATION}</p>;

  const board = data.board.filter((b) => !filter || `${b.book.genre} ${b.genres} ${b.book.title} ${b.book.authorName}`.toLowerCase().includes(filter.toLowerCase()));
  const active = data.swaps.filter((s) => s.status === "requested" || s.status === "accepted");
  const past = data.swaps.filter((s) => s.status === "declined" || s.status === "cancelled");

  return (
    <div className="mt-6 space-y-10">
      <p className="max-w-2xl text-sm text-muted">
        Feature another author&apos;s book in your newsletter, and they feature yours. List sizes come from real, confirmed
        subscribers, so nobody can inflate them. Each swap&apos;s link is tagged, so you both see how many readers the other
        side&apos;s send brought.
      </p>
      {note && <p className="text-sm text-danger">{note}</p>}
      {!data.studio && (
        <div className="border border-accent/40 bg-accent/5 p-3 text-sm">
          Newsletter swaps need an email list, which is part of Studio.{" "}
          <a href="/billing" className="text-accent underline">
            Get Studio
          </a>
        </div>
      )}

      {data.studio && (
        <section className="border border-line p-4">
          <h2 className="font-display text-xl">Your swap listing</h2>
          <p className="mt-1 text-xs text-muted">Your list: {data.myListRange}, counted from confirmed subscribers.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
            <label className="text-xs text-muted">
              Book to feature
              <select value={listing.projectId} onChange={(e) => setListing((l) => ({ ...l, projectId: e.target.value }))} className={input}>
                {data.myBooks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Genres you write and swap in
              <input value={listing.genres} onChange={(e) => setListing((l) => ({ ...l, genres: e.target.value }))} className={input} placeholder="Cozy mystery, small-town romance" />
            </label>
            <label className="text-xs text-muted sm:col-span-2">
              A note for partners
              <textarea rows={2} value={listing.note} onChange={(e) => setListing((l) => ({ ...l, note: e.target.value }))} className={input} placeholder="I send on Fridays and feature one book per issue." />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={listing.open} onChange={(e) => setListing((l) => ({ ...l, open: e.target.checked }))} />
              Open to swaps (show me on the board)
            </label>
            <button type="button" className="bg-accent px-4 py-2 text-paper" onClick={() => void act(() => send("/api/cross-promo/swaps", "PUT", listing), "Listing saved.")}>
              Save listing
            </button>
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="font-display text-xl">Your swaps</h2>
          <ul className="mt-3 space-y-3">
            {active.map((s) => (
              <li key={s.id} className="flex gap-4 border border-line p-4 text-sm">
                <Cover url={s.theirBook?.coverUrl || null} title={s.theirBook?.title || ""} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-ink">
                      {s.partnerName} · {s.theirBook?.title}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-accent">
                      {s.status === "requested" ? (s.role === "to" ? "Wants to swap" : "Waiting for an answer") : "Agreed"}
                    </span>
                  </div>
                  <p className="mt-1 text-muted">
                    You send {s.theirBook?.title} on {fmt(s.mySendOn)}
                    {s.iSent ? " ✓" : ""}. They send {s.myBook?.title} on {fmt(s.theirSendOn)}
                    {s.theySent ? " ✓" : ""}.
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {s.partnerListRange} · {s.partnerCompleted} swaps completed
                  </p>
                  {s.message && <p className="mt-2 whitespace-pre-wrap border-l-2 border-line pl-3 text-muted">{s.message}</p>}
                  {s.status === "accepted" && (
                    <p className="mt-2 text-xs text-muted">
                      Their send brought you {s.visitorsFromThem} {s.visitorsFromThem === 1 ? "reader" : "readers"}; yours brought them {s.visitorsFromMe}.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    {s.role === "to" && s.status === "requested" && (
                      <>
                        <button type="button" className="bg-accent px-3 py-1.5 text-paper" onClick={() => void act(() => send("/api/cross-promo/swaps", "PATCH", { id: s.id, action: "accept" }), "Swap accepted. Both send days are on your calendars.")}>
                          Accept
                        </button>
                        <button type="button" className="text-muted underline" onClick={() => void act(() => send("/api/cross-promo/swaps", "PATCH", { id: s.id, action: "decline" }))}>
                          Decline
                        </button>
                      </>
                    )}
                    {s.status === "accepted" && s.myLink && (
                      <button type="button" className="text-accent underline" onClick={() => void navigator.clipboard.writeText(s.myLink!)}>
                        Copy the link for your newsletter
                      </button>
                    )}
                    {s.status === "accepted" && !s.iSent && (
                      <button type="button" className="text-accent underline" onClick={() => void act(() => send("/api/cross-promo/swaps", "PATCH", { id: s.id, action: "sent" }))}>
                        I sent it
                      </button>
                    )}
                    {!(s.iSent && s.theySent) && !(s.role === "to" && s.status === "requested") && (
                      <button type="button" className="text-danger underline" onClick={() => void act(() => send("/api/cross-promo/swaps", "PATCH", { id: s.id, action: "cancel" }))}>
                        Cancel swap
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-xl">Swap board</h2>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by genre or title" className="border border-line bg-paper px-2 py-1.5 text-sm" />
        </div>
        {board.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No other authors are open to swaps{filter ? " in that genre" : ""} yet. Open your listing so they can find you.</p>
        ) : (
          <ul className="mt-3 grid gap-4 md:grid-cols-2">
            {board.map((b) => (
              <li key={b.userId} className="border border-line p-4 text-sm">
                <div className="flex gap-4">
                  <Cover url={b.book.coverUrl} title={b.book.title} />
                  <div className="min-w-0">
                    {b.book.url ? (
                      <a href={b.book.url} target="_blank" rel="noopener noreferrer" className="font-display text-lg hover:text-accent">
                        {b.book.title}
                      </a>
                    ) : (
                      <span className="font-display text-lg">{b.book.title}</span>
                    )}
                    <p className="text-muted">by {b.book.authorName}</p>
                    <p className="mt-1 text-xs text-muted">{[b.genres || b.book.genre, b.listRange, `${b.completed} swaps completed`].filter(Boolean).join(" · ")}</p>
                    {b.note && <p className="mt-2 text-muted">{b.note}</p>}
                  </div>
                </div>
                {data.studio &&
                  (asking === b.userId ? (
                    <form
                      className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act(async () => {
                          await send("/api/cross-promo/swaps", "POST", { toUser: b.userId, ...ask });
                          setAsking(null);
                        }, "Request sent.");
                      }}
                    >
                      <label className="text-xs text-muted sm:col-span-2">
                        Your book they&apos;ll feature
                        <select value={ask.projectId} onChange={(e) => setAsk((a) => ({ ...a, projectId: e.target.value }))} className={input}>
                          {data.myBooks.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted">
                        You send on
                        <input type="date" min={data.today} value={ask.mySendOn} onChange={(e) => setAsk((a) => ({ ...a, mySendOn: e.target.value }))} className={input} />
                      </label>
                      <label className="text-xs text-muted">
                        They send on
                        <input type="date" min={data.today} value={ask.theirSendOn} onChange={(e) => setAsk((a) => ({ ...a, theirSendOn: e.target.value }))} className={input} />
                      </label>
                      <label className="text-xs text-muted sm:col-span-2">
                        A short note
                        <textarea rows={2} value={ask.message} onChange={(e) => setAsk((a) => ({ ...a, message: e.target.value }))} className={input} placeholder="Why your readers would like each other's books" />
                      </label>
                      <div className="flex gap-3 sm:col-span-2">
                        <button type="submit" className="bg-accent px-4 py-2 text-sm text-paper">
                          Send request
                        </button>
                        <button type="button" className="text-sm text-muted underline" onClick={() => setAsking(null)}>
                          Never mind
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" className="mt-3 text-sm text-accent underline" onClick={() => setAsking(b.userId)}>
                      Ask to swap
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <p className="text-xs text-muted">
          {past.length} earlier {past.length === 1 ? "request was" : "requests were"} declined or cancelled.
        </p>
      )}
    </div>
  );
}

function PromoManager({ id, onChange }: { id: string; onChange: () => void }) {
  const [d, setD] = useState<PromoDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/cross-promo/promos/${id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not load");
    else setD(json);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (method: string, body?: unknown, query = "") => {
    setErr(null);
    try {
      await send(`/api/cross-promo/promos/${id}${query}`, method, body);
      await load();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    }
  };
  if (!d) return <p className="mt-3 text-xs text-muted">{err || "Loading…"}</p>;
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm">
      {err && <p className="text-danger">{err}</p>}
      <div className="flex flex-wrap gap-4 text-xs">
        <a href={d.promo.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
          Open the public page
        </a>
        <button type="button" className="text-accent underline" onClick={() => void navigator.clipboard.writeText(d.shareLink)}>
          Copy your share link
        </button>
        <span className="text-muted">{d.visitors} readers have visited</span>
      </div>
      <ul className="space-y-2">
        {d.books.map((b) => (
          <li key={b.projectId} className="flex items-center gap-3">
            <Cover url={b.coverUrl} title={b.title} />
            <div className="min-w-0 flex-1">
              <div>
                {b.title} <span className="text-muted">by {b.authorName}</span>
              </div>
              <div className="text-xs text-muted">
                {b.status === "applied" ? "Waiting for approval" : b.status === "approved" ? "In the promo" : b.status === "declined" ? "Declined" : "Withdrawn"}
                {b.priceNote ? ` · ${b.priceNote}` : ""}
                {b.status === "approved" ? ` · their share brought ${b.shared} readers · ${b.clicks} buy clicks` : ""}
              </div>
              <div className="mt-1 flex gap-3 text-xs">
                {d.isHost && b.status === "applied" && (
                  <>
                    <button type="button" className="text-accent underline" onClick={() => void act("PATCH", { action: "approve", projectId: b.projectId })}>
                      Approve
                    </button>
                    <button type="button" className="text-muted underline" onClick={() => void act("PATCH", { action: "decline", projectId: b.projectId })}>
                      Decline
                    </button>
                  </>
                )}
                {b.mine && (b.status === "applied" || b.status === "approved") && (
                  <button type="button" className="text-danger underline" onClick={() => void act("DELETE", undefined, `?projectId=${b.projectId}`)}>
                    Take my book out
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {d.isHost && d.promo.status === "open" && (
        <button type="button" className="text-xs text-danger underline" onClick={() => confirm("Cancel this promo for everyone?") && void act("PATCH", { action: "cancel" })}>
          Cancel the promo
        </button>
      )}
    </div>
  );
}

function Promos() {
  const [data, setData] = useState<PromoData | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [join, setJoin] = useState({ projectId: "", priceNote: "" });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", genre: "", description: "", startsOn: "", endsOn: "", applyBy: "", maxBooks: 30 });

  const load = useCallback(async () => {
    const res = await fetch("/api/cross-promo/promos");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setNote(json.error || "Could not load promos");
    setData(json);
    setJoin((j) => ({ ...j, projectId: j.projectId || json.myBooks?.[0]?.id || "" }));
    if (json.today)
      setForm((f) => (f.startsOn ? f : { ...f, applyBy: plusDays(json.today, 14), startsOn: plusDays(json.today, 21), endsOn: plusDays(json.today, 27) }));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p className="mt-6 text-sm text-muted">{note || "Loading…"}</p>;
  if (data.migrationNeeded) return <p className="mt-6 text-sm text-danger">{MIGRATION}</p>;

  const card = (p: Promo, children?: ReactNode) => (
    <li key={p.id} className="border border-line p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-lg">{p.title}</span>
        <span className="text-xs text-muted">
          {fmt(p.startsOn)} – {fmt(p.endsOn)}
          {p.genre ? ` · ${p.genre}` : ""}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Hosted by {p.isHost ? "you" : p.hostName} · {p.approved} of {p.maxBooks} books
        {p.isHost && p.waiting ? ` · ${p.waiting} waiting for you` : ""} · apply by {fmt(p.applyBy)}
        {p.status === "cancelled" ? " · cancelled" : ""}
      </p>
      {p.description && <p className="mt-2 text-muted">{p.description}</p>}
      {children}
    </li>
  );

  return (
    <div className="mt-6 space-y-10">
      <p className="max-w-2xl text-sm text-muted">
        Authors in the same genre put their books on one page for a week or so, often with a sale price, and every author
        shares it. Readers get a themed list; each of you reaches the others&apos; readers. Results show whose share brought
        readers, so everyone can see who pulled their weight.
      </p>
      {note && <p className="text-sm text-danger">{note}</p>}
      {!data.pro && (
        <div className="border border-accent/40 bg-accent/5 p-3 text-sm">
          Joining group promos is part of Pro and Studio; hosting them is part of Studio.{" "}
          <a href="/billing" className="text-accent underline">
            See plans
          </a>
        </div>
      )}

      {data.joined.length > 0 && (
        <section>
          <h2 className="font-display text-xl">Promos you&apos;re in</h2>
          <ul className="mt-3 space-y-3">
            {data.joined.map((p) =>
              card(
                p,
                <>
                  <p className="mt-2 text-xs text-muted">
                    {p.mine.map((m) => `${data.myBooks.find((b) => b.id === m.projectId)?.title || "Your book"}: ${m.status === "applied" ? "waiting for the host" : m.status}`).join(" · ")}
                  </p>
                  <button type="button" className="mt-2 text-xs text-accent underline" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    {open === p.id ? "Hide details" : "Details and share link"}
                  </button>
                  {open === p.id && <PromoManager id={p.id} onChange={() => void load()} />}
                </>
              )
            )}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-xl">Open to join</h2>
        {data.open.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No promos are taking books right now.{data.studio ? " Start one below." : ""}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.open.map((p) =>
              card(
                p,
                data.pro &&
                  (joining === p.id ? (
                    <form
                      className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_auto]"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setNote(null);
                        void send(`/api/cross-promo/promos/${p.id}`, "POST", join)
                          .then(() => {
                            setJoining(null);
                            setNote("Sent to the host.");
                            return load();
                          })
                          .catch((err) => setNote(err instanceof Error ? err.message : "Could not join"));
                      }}
                    >
                      <label className="text-xs text-muted">
                        Book
                        <select value={join.projectId} onChange={(e) => setJoin((j) => ({ ...j, projectId: e.target.value }))} className={input}>
                          {data.myBooks.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted">
                        Price during the promo (optional)
                        <input value={join.priceNote} onChange={(e) => setJoin((j) => ({ ...j, priceNote: e.target.value }))} className={input} placeholder="$0.99 this week" />
                      </label>
                      <div className="flex items-end gap-2">
                        <button type="submit" className="bg-accent px-4 py-2 text-sm text-paper">
                          Apply
                        </button>
                      </div>
                    </form>
                  ) : (
                    !p.mine.some((m) => m.status === "applied" || m.status === "approved") && (
                      <button type="button" className="mt-2 text-sm text-accent underline" onClick={() => setJoining(p.id)}>
                        Join with a book
                      </button>
                    )
                  ))
              )
            )}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-xl">Promos you host</h2>
          {data.studio && !creating && (
            <button type="button" className="text-sm text-accent underline" onClick={() => setCreating(true)}>
              Start a group promo
            </button>
          )}
        </div>
        {!data.studio && <p className="mt-2 text-sm text-muted">Hosting is part of Studio.</p>}
        {creating && (
          <form
            className="mt-3 grid gap-3 border border-line p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setNote(null);
              void send("/api/cross-promo/promos", "POST", form)
                .then(() => {
                  setCreating(false);
                  setNote("Promo created. Add your own book from its details, then invite authors to apply.");
                  return load();
                })
                .catch((err) => setNote(err instanceof Error ? err.message : "Could not create"));
            }}
          >
            <label className="text-xs text-muted sm:col-span-2">
              Title readers will see
              <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={input} placeholder="Cozy Mysteries Under $3" />
            </label>
            <label className="text-xs text-muted">
              Genre
              <input value={form.genre} onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))} className={input} placeholder="Cozy mystery" />
            </label>
            <label className="text-xs text-muted">
              Most books
              <input type="number" min={2} max={100} value={form.maxBooks} onChange={(e) => setForm((f) => ({ ...f, maxBooks: Number(e.target.value) }))} className={input} />
            </label>
            <label className="text-xs text-muted sm:col-span-2">
              What it is, for readers and authors
              <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={input} placeholder="Small-town sleuths, cats optional. Every book is $2.99 or less this week." />
            </label>
            <label className="text-xs text-muted">
              Applications close
              <input type="date" min={data.today} value={form.applyBy} onChange={(e) => setForm((f) => ({ ...f, applyBy: e.target.value }))} className={input} />
            </label>
            <span />
            <label className="text-xs text-muted">
              Starts
              <input type="date" min={data.today} value={form.startsOn} onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))} className={input} />
            </label>
            <label className="text-xs text-muted">
              Ends
              <input type="date" min={form.startsOn || data.today} value={form.endsOn} onChange={(e) => setForm((f) => ({ ...f, endsOn: e.target.value }))} className={input} />
            </label>
            <div className="flex gap-3 sm:col-span-2">
              <button type="submit" className="bg-accent px-4 py-2 text-sm text-paper">
                Create promo
              </button>
              <button type="button" className="text-sm text-muted underline" onClick={() => setCreating(false)}>
                Never mind
              </button>
            </div>
          </form>
        )}
        <ul className="mt-3 space-y-3">
          {data.hosting.map((p) =>
            card(
              p,
              <>
                {p.status === "open" && !p.mine.some((m) => m.status === "approved") && data.myBooks.length > 0 && (
                  <form
                    className="mt-3 flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send(`/api/cross-promo/promos/${p.id}`, "POST", join)
                        .then(load)
                        .catch((err) => setNote(err instanceof Error ? err.message : "Could not add"));
                    }}
                  >
                    <label className="text-xs text-muted">
                      Add your book
                      <select value={join.projectId} onChange={(e) => setJoin((j) => ({ ...j, projectId: e.target.value }))} className={input}>
                        {data.myBooks.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input value={join.priceNote} onChange={(e) => setJoin((j) => ({ ...j, priceNote: e.target.value }))} className="border border-line bg-paper px-2 py-1.5 text-sm" placeholder="Price (optional)" />
                    <button type="submit" className="border border-line px-3 py-1.5 text-sm">
                      Add
                    </button>
                  </form>
                )}
                <button type="button" className="mt-2 text-xs text-accent underline" onClick={() => setOpen(open === p.id ? null : p.id)}>
                  {open === p.id ? "Hide" : "Manage books and see results"}
                </button>
                {open === p.id && <PromoManager id={p.id} onChange={() => void load()} />}
              </>
            )
          )}
        </ul>
      </section>
    </div>
  );
}

export default function CrossPromoPage() {
  const [tab, setTab] = useState<"swaps" | "promos">("swaps");
  return (
    <div className="font-ui mx-auto min-h-screen max-w-5xl px-6 py-10">
      <Link href="/dashboard/marketing" className="text-sm text-accent hover:underline">
        ← Marketing
      </Link>
      <h1 className="font-display mt-3 text-3xl">Cross-promotion</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Team up with other authors to reach each other&apos;s readers.</p>
      <div className="mt-6 flex gap-2 text-sm">
        {(
          [
            ["swaps", "Newsletter swaps"],
            ["promos", "Group promos"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`border px-4 py-2 ${tab === k ? "border-accent bg-accent/5 text-ink" : "border-line text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "swaps" ? <Swaps /> : <Promos />}
    </div>
  );
}

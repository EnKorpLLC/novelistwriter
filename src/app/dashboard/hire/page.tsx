"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MARKET_TYPES, type MarketTypeStatus } from "@/lib/market-types";
import { MARKET_FEE_PCT } from "@/lib/market-quotes";

type JobRow = { id: string; title: string; type: string; status: string; other: string; updatedAt: string };
type Pro = { userId: string; name: string; headline: string; rateNote: string; founding: boolean };

const STATUS: Record<string, string> = {
  requested: "Waiting for a quote",
  quoted: "Quote to review",
  agreed: "In progress",
  completed: "Complete",
  cancelled: "Cancelled",
  declined: "Declined",
  not_chosen: "Went to another pro",
  disputed: "Paused (we're looking at it)",
};
const HIREABLE = MARKET_TYPES.filter((t) => t.id !== "narration");

/** Hiring an editor or artist: the author's requests and jobs, and a new request (directory pros, or their own by email). */
export default function HirePage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<{ hiring: JobRow[]; migrationNeeded?: boolean; error?: string } | null>(null);
  const [types, setTypes] = useState<MarketTypeStatus[]>([]);
  const [books, setBooks] = useState<{ id: string; title: string }[]>([]);
  const [pros, setPros] = useState<Pro[]>([]);
  const [form, setForm] = useState({ type: "line_copy", projectId: "", title: "", brief: "", deadline: "", budgetNote: "", who: "invite" as "invite" | "directory", inviteEmail: "", proIds: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadOptions = useCallback(async (type: string) => {
    const r = await fetch(`/api/market/options?type=${type}`).catch(() => null);
    const d = r?.ok ? await r.json() : null;
    if (!d) return;
    setTypes(d.types);
    setBooks(d.books);
    setPros(d.pros);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const type = q.get("type");
    const pro = q.get("pro");
    if (type && HIREABLE.some((t) => t.id === type)) setForm((f) => ({ ...f, type, ...(pro ? { who: "directory", proIds: [pro] } : {}) }));
    void fetch("/api/market/jobs")
      .then((r) => r.json())
      .then(setJobs)
      .catch(() => setJobs({ hiring: [] }));
  }, []);
  useEffect(() => {
    void loadOptions(form.type);
  }, [form.type, loadOptions]);

  const open = types.find((t) => t.id === form.type)?.state === "open";
  const input = "mt-1 block w-full border border-line bg-paper px-3 py-2 text-sm text-ink";

  async function send() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/market/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        projectId: form.projectId || null,
        title: form.title,
        brief: form.brief,
        deadline: form.deadline || null,
        budgetNote: form.budgetNote,
        ...(form.who === "invite" ? { inviteEmail: form.inviteEmail } : { proIds: form.proIds }),
      }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(d.error || "Couldn't send the request");
    if (d.ids?.length === 1) router.push(`/hire/job/${d.ids[0]}`);
    else window.location.reload();
  }

  return (
    <div className="font-ui mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/dashboard" className="text-sm text-accent hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-3 text-3xl">Hire help</h1>
      <p className="mt-2 text-sm text-muted">
        Editors, proofreaders, cover designers, illustrators, and map makers. You pay each milestone as it starts, plus our {MARKET_FEE_PCT}%, and we hold it until
        you approve the work. Narrators are invited from a book&apos;s Audio tab.{" "}
        <Link href="/hire" className="underline">
          Browse the directory
        </Link>
      </p>
      {jobs?.migrationNeeded && <p className="mt-3 text-sm text-danger">{jobs.error}</p>}

      {jobs && jobs.hiring.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl">Your requests and jobs</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
            {jobs.hiring.map((j) => (
              <li key={j.id}>
                <Link href={`/hire/job/${j.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-accent">
                  <span>
                    <span className="text-ink">{j.title}</span>
                    <span className="text-xs text-muted">
                      {" "}
                      · {j.type}
                      {j.other ? ` · ${j.other}` : ""}
                    </span>
                  </span>
                  <span className={`text-xs ${j.status === "quoted" ? "text-accent" : "text-muted"}`}>{STATUS[j.status] || j.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 border border-line p-4 text-sm">
        <h2 className="font-display text-xl">New request</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-muted">
            What you need
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, proIds: [] })} className={input}>
              {HIREABLE.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            For which book (optional)
            <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className={input}>
              <option value="">Not tied to a book</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 block text-xs text-muted">
          Title
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Copy edit of The Ember Coast" className={input} />
        </label>
        <label className="mt-3 block text-xs text-muted">
          The brief: what you need, the book&apos;s length and genre, and anything they should know
          <textarea value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} rows={6} className={input} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-muted">
            Wanted by (optional)
            <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={input} />
          </label>
          <label className="block text-xs text-muted">
            Budget (optional)
            <input value={form.budgetNote} onChange={(e) => setForm({ ...form, budgetNote: e.target.value })} placeholder="Around $800" className={input} />
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs text-muted">Who to ask</legend>
          <label className="mt-1 flex items-center gap-2">
            <input type="radio" checked={form.who === "invite"} onChange={() => setForm({ ...form, who: "invite" })} /> Someone I already work with (by email)
          </label>
          <label className={`mt-1 flex items-center gap-2 ${open ? "" : "text-muted"}`}>
            <input type="radio" disabled={!open} checked={form.who === "directory"} onChange={() => setForm({ ...form, who: "directory" })} /> Pros from the directory
            {!open && (
              <span className="text-xs">
                (not open yet for this kind.{" "}
                <Link href={`/hire#${form.type}`} className="underline">
                  Join the waitlist
                </Link>
                )
              </span>
            )}
          </label>
        </fieldset>
        {form.who === "invite" ? (
          <label className="mt-3 block text-xs text-muted">
            Their email
            <input type="email" value={form.inviteEmail} onChange={(e) => setForm({ ...form, inviteEmail: e.target.value })} className={input} />
            <span className="mt-1 block">They get a free account to read your brief and quote. Payments, the agreement, and delivery all work the same way.</span>
          </label>
        ) : (
          <div className="mt-3">
            <p className="text-xs text-muted">Pick up to five. Each sends their own quote; accepting one closes the rest.</p>
            <ul className="mt-2 space-y-1">
              {pros.map((p) => (
                <li key={p.userId}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={form.proIds.includes(p.userId)}
                      disabled={!form.proIds.includes(p.userId) && form.proIds.length >= 5}
                      onChange={(e) => setForm({ ...form, proIds: e.target.checked ? [...form.proIds, p.userId] : form.proIds.filter((x) => x !== p.userId) })}
                    />
                    <span>
                      {p.name}
                      {p.founding ? <span className="ml-1 text-[11px] text-accent">Founding pro</span> : null}
                      <span className="block text-xs text-muted">
                        {p.headline}
                        {p.rateNote ? ` · ${p.rateNote}` : ""} ·{" "}
                        <a href={`/hire/pro/${p.userId}?type=${form.type}`} target="_blank" className="underline">
                          profile
                        </a>
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" disabled={busy} className="mt-4 bg-accent px-4 py-2 text-paper disabled:opacity-60" onClick={() => void send()}>
          {busy ? "Sending…" : "Send the request"}
        </button>
        {msg && <p className="mt-2 text-danger">{msg}</p>}
      </section>
    </div>
  );
}

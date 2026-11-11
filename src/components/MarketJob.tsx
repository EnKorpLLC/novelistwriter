"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AGREEMENT_NOTE,
  MIN_JOB_CENTS,
  MIN_MILESTONE_CENTS,
  RIGHTS,
  agreementText,
  defaultMilestones,
  dollars,
  quoteProblem,
  quoteTotal,
  withFee,
  type Quote,
  type Rights,
} from "@/lib/market-quotes";

type Milestone = {
  id: string;
  title: string;
  proCents: number;
  totalCents: number;
  dueOn: string | null;
  status: string;
  revisionsUsed: number;
  deliveryNote: string;
  deliveredAt: string | null;
  autoApproveOn: string | null;
  paidOutCents: number;
};
type FileRow = { id: string; milestoneId: string | null; kind: string; name: string; bytes: number; mine: boolean; url: string | null };
type Job = {
  id: string;
  role: "author" | "pro";
  hasBook: boolean;
  review: { stars: number; body: string; reply: string | null } | null;
  title: string;
  brief: string;
  deadline: string | null;
  budgetNote: string;
  type: { id: string; label: string; group: string };
  status: string;
  source: string;
  book: string | null;
  authorName: string;
  proName: string;
  invitePending: boolean;
  quote: Quote | null;
  quoteVersion: number;
  agreement: string | null;
  agreedAt: string | null;
  disputeNote: string | null;
  cancelReason: string | null;
  feePct: number;
  payableId: string | null;
  milestones: Milestone[];
  files: FileRow[];
  messages: { id: string; mine: boolean; body: string; at: string }[];
  /** The platform admin reading a job to settle a dispute */
  adminView?: boolean;
};

const STATUS: Record<string, string> = {
  requested: "Waiting for a quote",
  quoted: "Quote sent",
  agreed: "In progress",
  completed: "Complete",
  cancelled: "Cancelled",
  declined: "Declined",
  not_chosen: "Went to another pro",
  disputed: "Paused: Novelist Writer is looking at it",
};
const M_STATUS: Record<string, string> = {
  unpaid: "Not paid yet",
  paid: "Paid, in progress",
  delivered: "Delivered, waiting for approval",
  changes: "Changes requested",
  approved: "Approved and paid",
  refunded: "Refunded",
  cancelled: "Cancelled",
};
const mb = (b: number) => `${Math.max(0.1, b / 1024 / 1024).toFixed(1)} MB`;
const toCents = (v: string) => Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100) || 0;
const input = "mt-1 block w-full border border-line bg-paper px-3 py-2 text-sm text-ink";

/** One marketplace job, for both sides. */
export function MarketJob({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/market/jobs/${jobId}`).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) return setError(d.error || "Job not found");
    setJob(d.job);
  }, [jobId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch(`/api/market/jobs/${jobId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Something went wrong");
    return d as Record<string, unknown>;
  }

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMsg(null);
    try {
      const done = await fn();
      if (done) setMsg({ ok: true, text: done });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: File[], kind: "brief" | "delivery" | "process", milestoneId?: string) {
    await run("upload", async () => {
      for (const [i, f] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
        const up = await post({ action: "upload_url", name: f.name, kind, milestoneId });
        const put = await fetch(String(up.url), { method: "PUT", body: f, headers: { "Content-Type": f.type || "application/octet-stream" } });
        if (!put.ok) throw new Error(`${f.name} didn't upload (${put.status}). Try again.`);
        await post({ action: "uploaded", key: up.key, name: f.name, kind, milestoneId });
      }
      return files.length === 1 ? "File added." : `${files.length} files added.`;
    });
  }

  if (error) return <p className="mt-6 text-sm text-danger">{error}</p>;
  if (!job) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  const author = job.role === "author";
  // An admin reading a dispute sees everything but can't act
  const closed = ["completed", "cancelled", "declined", "not_chosen"].includes(job.status) || Boolean(job.adminView);
  const briefFiles = job.files.filter((f) => f.kind === "brief");

  return (
    <div className="mt-4 space-y-8 text-sm">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted">
          {job.type.label} · {STATUS[job.status] || job.status}
        </p>
        <h1 className="font-display mt-1 text-3xl">{job.title}</h1>
        <p className="mt-1 text-muted">
          {author ? `With ${job.proName}` : `For ${job.authorName}`}
          {job.book ? ` · for "${job.book}"` : ""}
          {job.invitePending ? " · waiting for them to accept your invite" : ""}
        </p>
        {job.disputeNote && <p className="mt-2 border border-accent/40 bg-accent/5 px-3 py-2">We&apos;re looking at this job. Payments are on hold until we&apos;re in touch.</p>}
        {job.status === "cancelled" && job.cancelReason && <p className="mt-2 text-muted">Cancelled: {job.cancelReason}</p>}
      </header>

      <section>
        <h2 className="font-display text-xl">The brief</h2>
        <p className="mt-2 whitespace-pre-wrap">{job.brief}</p>
        <p className="mt-2 text-xs text-muted">
          {job.deadline ? `Wanted by ${job.deadline}` : "No set deadline"}
          {job.budgetNote ? ` · Budget: ${job.budgetNote}` : ""}
        </p>
        <FileList files={briefFiles} canRemove={author && !closed} onRemove={(id) => void run("remove", async () => void (await post({ action: "remove_file", fileId: id })))} />
        {author && !closed && (
          <FilePicker label="Add reference files" disabled={Boolean(busy)} onPick={(fs) => void upload(fs, "brief")} />
        )}
      </section>

      {!job.agreement && !closed && (
        <section className="border border-line p-4">
          <h2 className="font-display text-xl">Quote</h2>
          {job.role === "pro" ? (
            <QuoteForm job={job} busy={Boolean(busy)} onSend={(q) => run("quote", async () => (await post({ action: "quote", quote: q }), "Quote sent. The author can accept it or ask questions here."))} onDecline={(reason) => run("decline", async () => void (await post({ action: "decline", reason })))} />
          ) : job.quote ? (
            <QuoteView job={job} quote={job.quote} onAccept={() => run("accept", async () => (await post({ action: "accept", version: job.quoteVersion }), "Accepted. Pay the first milestone to start the work."))} busy={Boolean(busy)} />
          ) : (
            <p className="mt-2 text-muted">{job.invitePending ? "Once they accept your invite, they'll send a quote here." : "Waiting for a quote. You'll get an email when it arrives."}</p>
          )}
        </section>
      )}

      {job.agreement && (
        <section>
          <h2 className="font-display text-xl">Milestones</h2>
          <ol className="mt-3 space-y-3">
            {job.milestones.map((m, i) => (
              <MilestoneCard
                key={m.id}
                n={i + 1}
                m={m}
                job={job}
                files={job.files.filter((f) => f.milestoneId === m.id)}
                last={i === job.milestones.length - 1}
                busy={job.adminView ? "admin" : busy}
                onPay={() => run("pay", async () => {
                  const d = await post({ action: "pay", milestoneId: m.id });
                  window.location.href = String(d.url);
                })}
                onUpload={(fs, kind) => void upload(fs, kind, m.id)}
                onRemove={(id) => void run("remove", async () => void (await post({ action: "remove_file", fileId: id })))}
                onDeliver={(note) => run("deliver", async () => (await post({ action: "deliver", milestoneId: m.id, note }), "Delivered. The author has been told."))}
                onApprove={() => run("approve", async () => (await post({ action: "approve", milestoneId: m.id }), "Approved. The pro is being paid."))}
                onChanges={(note) => run("changes", async () => (await post({ action: "changes", milestoneId: m.id, note }), "Sent to the pro."))}
                onUseArt={(fileId, action) =>
                  void run("art", async () => {
                    await post({ action, fileId });
                    return action === "use_cover" ? "It's now your book's cover." : "Added to your book's Extras in the Sell tab, turned off. Set how to offer it there.";
                  })
                }
              />
            ))}
          </ol>
          {job.role === "pro" && job.type.group === "editing" && job.hasBook && job.milestones.some((m) => m.status !== "unpaid" && m.status !== "cancelled") && (
            <p className="mt-3 text-xs">
              <a href={`/api/market/jobs/${job.id}/manuscript`} className="border border-accent px-3 py-1.5 text-accent">
                Download the manuscript (Word)
              </a>{" "}
              <span className="text-muted">Edit with Track Changes on, keep each chapter&apos;s heading, and deliver the file here. The author reviews each change.</span>
            </p>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-accent">The agreement{job.agreedAt ? ` (agreed ${new Date(job.agreedAt).toLocaleDateString()})` : ""}</summary>
            <p className="mt-2 whitespace-pre-wrap text-muted">{job.agreement}</p>
            <p className="mt-2 text-xs text-muted">{AGREEMENT_NOTE}</p>
          </details>
        </section>
      )}

      {job.status === "completed" && !job.adminView && (
        <ReviewBox job={job} busy={Boolean(busy)} onSend={(body) => run("review", async () => (await post(body), "Thank you. It's on their profile."))} />
      )}

      <section>
        <h2 className="font-display text-xl">Messages</h2>
        <ul className="mt-2 space-y-2">
          {job.messages.map((m) => (
            <li key={m.id} className={`max-w-[85%] border px-3 py-2 ${m.mine ? "ml-auto border-accent/40 bg-accent/5" : "border-line"}`}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-[11px] text-muted">{new Date(m.at).toLocaleString()}</p>
            </li>
          ))}
          {!job.messages.length && <p className="text-muted">No messages yet. Questions about the brief or the quote go here.</p>}
        </ul>
        {!["declined", "not_chosen"].includes(job.status) && !(author && job.invitePending) && !job.adminView && (
          <form
            className="mt-2 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void run("message", async () => {
                await post({ action: "message", body: message });
                setMessage("");
              });
            }}
          >
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="min-w-0 flex-1 border border-line bg-paper px-3 py-2" placeholder="Write a message" />
            <button type="submit" disabled={Boolean(busy) || !message.trim()} className="bg-accent px-4 py-2 text-paper disabled:opacity-50">
              Send
            </button>
          </form>
        )}
      </section>

      {!closed && (
        <section className="flex flex-wrap gap-3 border-t border-line pt-4 text-xs">
          <button
            type="button"
            disabled={Boolean(busy)}
            className="text-danger underline"
            onClick={() => {
              const reason = window.prompt(job.role === "pro" && job.milestones.some((m) => m.status === "paid") ? "Cancel this job? The milestone in progress is refunded to the author in full. Reason:" : "Cancel this job? Reason (they'll see it):");
              if (reason !== null) void run("cancel", async () => (await post({ action: "cancel", reason }), "Cancelled."));
            }}
          >
            Cancel the job
          </button>
          {job.status === "agreed" && (
            <button
              type="button"
              disabled={Boolean(busy)}
              className="text-muted underline"
              onClick={() => {
                const note = window.prompt("What's wrong? We'll read the agreement, the messages, and the deliveries, then step in. Payments pause until then.");
                if (note !== null) void run("dispute", async () => (await post({ action: "dispute", note }), "Sent. We'll be in touch."));
              }}
            >
              Ask Novelist Writer to step in
            </button>
          )}
        </section>
      )}
      {busy?.startsWith("Uploading") && <p className="text-xs text-muted">{busy}</p>}
      {msg && <p className={`text-sm ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}

const stars = (n: number) => `${"★".repeat(n)}${"☆".repeat(5 - n)}`;

/** After a job is complete: the author's review (completed jobs only), and the pro's one reply. */
function ReviewBox({ job, busy, onSend }: { job: Job; busy: boolean; onSend: (body: Record<string, unknown>) => void }) {
  const [n, setN] = useState(5);
  const [text, setText] = useState("");
  const r = job.review;
  return (
    <section className="border border-line p-4">
      <h2 className="font-display text-xl">Review</h2>
      {r ? (
        <div className="mt-2">
          <p className="text-accent">{stars(r.stars)}</p>
          {r.body && <p className="mt-1 whitespace-pre-wrap">{r.body}</p>}
          {r.reply && <p className="mt-2 border-l-2 border-line pl-3 text-muted">Reply from {job.proName}: {r.reply}</p>}
          {job.role === "pro" && !r.reply && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="A short reply (optional, once)" className="min-w-0 flex-1 border border-line bg-paper px-2 py-1.5" />
              <button type="button" disabled={busy || !text.trim()} className="border border-line px-3 py-1.5 text-xs disabled:opacity-50" onClick={() => onSend({ action: "reply", body: text })}>
                Reply
              </button>
            </div>
          )}
        </div>
      ) : job.role === "author" ? (
        <div className="mt-2 space-y-2">
          <p className="text-muted">How was working with {job.proName}? Reviews only come from completed jobs, and show on their profile.</p>
          <div className="flex gap-1 text-2xl" role="radiogroup" aria-label="Stars">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" role="radio" aria-checked={n === i} aria-label={`${i} stars`} className={i <= n ? "text-accent" : "text-line"} onClick={() => setN(i)}>
                ★
              </button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="What went well, and what authors should know" className="block w-full border border-line bg-paper px-2 py-1.5" />
          <button type="button" disabled={busy} className="bg-accent px-4 py-2 text-paper disabled:opacity-50" onClick={() => onSend({ action: "review", stars: n, body: text })}>
            Post the review
          </button>
        </div>
      ) : (
        <p className="mt-2 text-muted">The author hasn&apos;t left a review yet.</p>
      )}
    </section>
  );
}

function FileList({ files, canRemove, onRemove, actions }: { files: FileRow[]; canRemove: boolean; onRemove: (id: string) => void; actions?: (f: FileRow) => ReactNode }) {
  if (!files.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {files.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-2">
          {f.url ? (
            <a href={f.url} className="text-accent underline">
              {f.name}
            </a>
          ) : (
            <span>{f.name}</span>
          )}
          <span className="text-muted">
            {mb(f.bytes)}
            {f.kind === "process" ? " · process proof" : ""}
          </span>
          {canRemove && f.mine && (
            <button type="button" className="text-danger underline" onClick={() => onRemove(f.id)}>
              Remove
            </button>
          )}
          {actions?.(f)}
        </li>
      ))}
    </ul>
  );
}

function FilePicker({ label, disabled, onPick }: { label: string; disabled: boolean; onPick: (files: File[]) => void }) {
  return (
    <label className="mt-2 inline-block cursor-pointer border border-line px-3 py-1.5 text-xs">
      {label}
      <input
        type="file"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const fs = [...(e.target.files || [])];
          e.target.value = "";
          if (fs.length) onPick(fs);
        }}
      />
    </label>
  );
}

function QuoteForm({ job, busy, onSend, onDecline }: { job: Job; busy: boolean; onSend: (q: Quote) => void; onDecline: (reason: string) => void }) {
  const art = job.type.group === "art";
  const start = job.quote;
  const [scope, setScope] = useState(start?.scope || "");
  const [deliverables, setDeliverables] = useState(start?.deliverables || "");
  const [revisions, setRevisions] = useState(String(start?.revisions ?? (art ? 2 : 1)));
  const [rights, setRights] = useState<Rights>(start?.rights || "license");
  const [note, setNote] = useState(start?.note || "");
  const [ms, setMs] = useState((start?.milestones.length ? start.milestones : defaultMilestones(job.type.id)).map((m) => ({ title: m.title, price: m.cents ? (m.cents / 100).toFixed(2) : "", dueOn: m.dueOn || "" })));
  const quote: Quote = {
    scope,
    deliverables,
    revisions: Number(revisions) || 0,
    rights: art ? rights : null,
    note,
    milestones: ms.map((m) => ({ title: m.title, cents: toCents(m.price), dueOn: m.dueOn || null })),
  };
  const total = quoteTotal(quote);
  const problem = quoteProblem(quote);
  return (
    <div className="mt-2 space-y-3">
      {start && <p className="text-xs text-accent">You sent a quote. Changing it sends the author the new version.</p>}
      <label className="block text-xs text-muted">
        Scope: what you&apos;ll do
        <textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={4} className={input} placeholder={art ? "Front cover for a 6×9 paperback and the ebook, in a painted style..." : "A full copy edit of the 92,000-word manuscript for grammar, consistency, and style..."} />
      </label>
      <label className="block text-xs text-muted">
        What the author receives
        <textarea value={deliverables} onChange={(e) => setDeliverables(e.target.value)} rows={2} className={input} placeholder={art ? "Final art as layered PSD and full-size PNG, a 2560×1600 ebook cover..." : "The manuscript in Word with tracked changes, a style sheet, and a short letter..."} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted">
          Rounds of changes included per milestone
          <input value={revisions} onChange={(e) => setRevisions(e.target.value)} inputMode="numeric" className={input} />
        </label>
        {art && (
          <label className="block text-xs text-muted">
            Rights
            <select value={rights} onChange={(e) => setRights(e.target.value as Rights)} className={input}>
              {RIGHTS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div>
        <p className="text-xs text-muted">Milestones: the author pays each when it starts; you&apos;re paid when they approve it. At least {dollars(MIN_MILESTONE_CENTS)} each, {dollars(MIN_JOB_CENTS)} in all.</p>
        <ul className="mt-2 space-y-2">
          {ms.map((m, i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-[1fr_7rem_10rem_auto]">
              <input value={m.title} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Milestone" className="border border-line bg-paper px-2 py-1.5" />
              <input value={m.price} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} inputMode="decimal" placeholder="$" className="border border-line bg-paper px-2 py-1.5" />
              <input type="date" value={m.dueOn} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, dueOn: e.target.value } : x)))} className="border border-line bg-paper px-2 py-1" />
              {ms.length > 1 && (
                <button type="button" className="text-xs text-danger underline" onClick={() => setMs(ms.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {ms.length < 6 && (
          <button type="button" className="mt-2 text-xs text-accent underline" onClick={() => setMs([...ms, { title: "", price: "", dueOn: "" }])}>
            Add a milestone
          </button>
        )}
      </div>
      <label className="block text-xs text-muted">
        Anything else (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={input} />
      </label>
      <p className="text-xs">
        You receive <strong>{dollars(total)}</strong>. The author pays {dollars(withFee(total))}, including our {job.feePct}% on top.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || Boolean(problem)} className="bg-accent px-4 py-2 text-paper disabled:opacity-50" onClick={() => onSend(quote)}>
          {start ? "Send the new quote" : "Send quote"}
        </button>
        <button
          type="button"
          disabled={busy}
          className="text-xs text-muted underline"
          onClick={() => {
            const reason = window.prompt("Pass on this job? A short note for the author (optional):");
            if (reason !== null) onDecline(reason);
          }}
        >
          Pass on this job
        </button>
        {problem && <span className="text-xs text-muted">{problem}</span>}
      </div>
    </div>
  );
}

function QuoteView({ job, quote, onAccept, busy }: { job: Job; quote: Quote; onAccept: () => void; busy: boolean }) {
  const total = quoteTotal(quote);
  const preview = agreementText({ title: job.title, marketType: job.type.id, book: job.book }, quote, { author: job.authorName, pro: job.proName });
  return (
    <div className="mt-2 space-y-3">
      <p className="whitespace-pre-wrap">{quote.scope}</p>
      <p className="text-muted">
        <strong className="text-ink">You receive:</strong> {quote.deliverables}
      </p>
      <ol className="space-y-1">
        {quote.milestones.map((m, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-line py-1">
            <span>
              {i + 1}. {m.title}
              {m.dueOn ? <span className="text-muted"> · due {m.dueOn}</span> : null}
            </span>
            <span>{dollars(withFee(m.cents))}</span>
          </li>
        ))}
      </ol>
      <p>
        <strong>{dollars(withFee(total))}</strong> in all: {dollars(total)} to {job.proName} and our {job.feePct}% fee. {quote.revisions}{" "}
        {quote.revisions === 1 ? "round" : "rounds"} of changes per milestone.
        {quote.rights ? ` Rights: ${RIGHTS.find((r) => r.id === quote.rights)?.label.toLowerCase()}.` : ""}
      </p>
      {quote.note && <p className="text-muted">{quote.note}</p>}
      <details>
        <summary className="cursor-pointer text-accent">Read the agreement</summary>
        <p className="mt-2 whitespace-pre-wrap text-muted">{preview}</p>
        <p className="mt-2 text-xs text-muted">{AGREEMENT_NOTE}</p>
      </details>
      <button type="button" disabled={busy} className="bg-accent px-4 py-2 text-paper disabled:opacity-50" onClick={onAccept}>
        Accept the quote and agreement
      </button>
      <p className="text-xs text-muted">Nothing is charged until you pay the first milestone. Questions first? Use the messages below.</p>
    </div>
  );
}

function MilestoneCard({
  n,
  m,
  job,
  files,
  last,
  busy,
  onPay,
  onUpload,
  onRemove,
  onDeliver,
  onApprove,
  onChanges,
  onUseArt,
}: {
  n: number;
  m: Milestone;
  job: Job;
  files: FileRow[];
  last: boolean;
  busy: string | null;
  onPay: () => void;
  onUpload: (files: File[], kind: "delivery" | "process") => void;
  onRemove: (id: string) => void;
  onDeliver: (note: string) => void;
  onApprove: () => void;
  onChanges: (note: string) => void;
  onUseArt: (fileId: string, action: "use_cover" | "add_extra") => void;
}) {
  const [note, setNote] = useState("");
  const author = job.role === "author";
  const working = !author && ["paid", "changes"].includes(m.status) && job.status === "agreed";
  const revisionsLeft = Math.max(0, (job.quote?.revisions ?? 0) - m.revisionsUsed);
  const delivered = ["delivered", "approved"].includes(m.status);
  // Author-side shortcuts on delivered files: review an editor's Word file, or put art into the book
  const actions = (f: FileRow) => {
    if (!author || f.kind !== "delivery" || !delivered || !job.hasBook || job.adminView) return null;
    if (job.type.group === "editing" && /\.docx$/i.test(f.name)) {
      return (
        <a href={`/hire/job/${job.id}/review/${f.id}`} className="border border-accent px-2 py-0.5 text-accent">
          Review these edits in the app
        </a>
      );
    }
    if (job.type.group === "art" && /\.(jpe?g|png|webp)$/i.test(f.name)) {
      const sellable = job.quote?.rights === "license_merch" || job.quote?.rights === "buyout";
      return (
        <>
          {job.type.id === "cover" && (
            <button type="button" disabled={Boolean(busy)} className="border border-accent px-2 py-0.5 text-accent" onClick={() => onUseArt(f.id, "use_cover")}>
              Use as my book&apos;s cover
            </button>
          )}
          {sellable && (
            <button type="button" disabled={Boolean(busy)} className="border border-line px-2 py-0.5" onClick={() => onUseArt(f.id, "add_extra")}>
              Sell as an extra
            </button>
          )}
        </>
      );
    }
    return null;
  };
  return (
    <li className={`border p-3 ${m.status === "delivered" || job.payableId === m.id ? "border-accent" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-ink">
          {n}. {m.title}
          {m.dueOn ? <span className="text-muted"> · due {m.dueOn}</span> : null}
        </span>
        <span className="text-xs text-muted">
          {author ? dollars(m.totalCents) : dollars(m.proCents)} · {M_STATUS[m.status] || m.status}
        </span>
      </div>
      {m.deliveryNote && <p className="mt-2 whitespace-pre-wrap text-muted">{m.deliveryNote}</p>}
      <FileList files={files} canRemove={working} onRemove={onRemove} actions={actions} />
      {author && job.payableId === m.id && (
        <button type="button" disabled={Boolean(busy)} className="mt-2 bg-accent px-4 py-2 text-paper disabled:opacity-50" onClick={onPay}>
          Pay {dollars(m.totalCents)} to start this milestone
        </button>
      )}
      {author && m.status === "delivered" && job.status === "agreed" && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={Boolean(busy)} className="bg-accent px-4 py-2 text-paper disabled:opacity-50" onClick={onApprove}>
              Approve and pay {job.proName}
            </button>
            {m.autoApproveOn && <span className="text-xs text-muted">Counts as approved on {m.autoApproveOn} if you don&apos;t answer.</span>}
          </div>
          {revisionsLeft > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change?" className="min-w-0 flex-1 border border-line bg-paper px-2 py-1.5" />
              <button type="button" disabled={Boolean(busy) || !note.trim()} className="border border-line px-3 py-1.5 text-xs disabled:opacity-50" onClick={() => onChanges(note)}>
                Ask for changes ({revisionsLeft} left)
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted">The included rounds of changes are used. For more, agree extra work with the pro in messages.</p>
          )}
        </div>
      )}
      {working && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <FilePicker label="Add delivery files" disabled={Boolean(busy)} onPick={(fs) => onUpload(fs, "delivery")} />
            {job.type.group === "art" && <FilePicker label="Add process proof" disabled={Boolean(busy)} onPick={(fs) => onUpload(fs, "process")} />}
          </div>
          {job.type.group === "art" && last && <p className="text-xs text-muted">The final delivery needs process proof: a sketch, a work in progress, or the layered file.</p>}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="A note with the delivery (optional)" className="block w-full border border-line bg-paper px-2 py-1.5" />
          <button type="button" disabled={Boolean(busy)} className="bg-accent px-4 py-2 text-paper disabled:opacity-50" onClick={() => onDeliver(note)}>
            {m.status === "changes" ? "Send the revised delivery" : "Deliver"}
          </button>
        </div>
      )}
      {!author && m.status === "unpaid" && job.payableId === m.id && <p className="mt-2 text-xs text-muted">Waiting for the author to pay this milestone. Don&apos;t start until it&apos;s paid.</p>}
    </li>
  );
}
